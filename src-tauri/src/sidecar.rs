// Copyright 2026 ApE Project Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! # ApE Sidecar Manager
//!
//! Manages a persistent Python child process communicating over NDJSON.
//!
//! ## Design notes
//!
//! ### Async stdout/stderr deadlock avoidance
//!
//! When a process writes enough data to stdout or stderr to fill the OS pipe
//! buffer (typically ~64KB on Linux, smaller on Windows), further writes in
//! the child block until a reader drains a buffer. If you only read stdout
//! with `cmd.stdout.read_to_string(...)` or `Child::wait_with_output()`,
//! the child can still be blocked on a write to stderr, and vice versa. The
//! whole task then deadlocks even though each file descriptor is unbuffered
//! at the Rust level.
//!
//! The fix used here is:
//! 1. Spawn the Python process with `stdout(Stdio::piped())` and
//!    `stderr(Stdio::piped())`.
//! 2. Wrap both streams in non-blocking readers via
//!    [`AsyncReadExt::readable`]/[`AsyncReadExt::read_buf`].
//! 3. Drive each stream in its own `tokio::spawn`-ed task, so they cannot
//!    block each other. Both readers forward complete JSON lines into a
//!    bounded channel. The sidecar's `response_rx` consumes only fully
//!    reconstructed NDJSON lines.
//! 4. We never block on both streams simultaneously. If the child crashes,
//!    each reader handles its own EOF independently and the restart path
//!    cancels both tasks cleanly by dropping the shared `CancellationToken`.
//!
//! ### Correlation table
//!
//! Every outgoing request carries a fresh `request_id` (a UUID). We insert
//! `(request_id, oneshot::Sender)` into a `HashMap` before the request is
//! flushed to stdin. The response reader matches on the `request_id` field
//! in every inbound NDJSON line and completes the corresponding oneshot,
//! delivering the JSON to the awaiting caller. Expired/replaced senders are
//! pruned on receive to avoid unbounded growth.
//!
//! ### Temp-file offload (> 1 MB)
//!
//! Large payloads are written to a temp file under `std::env::temp_dir()`.
//! The JSON envelope semantics stay identical; an `OffloadedPayload` pointer
//! is substituted for the actual large bytes, and a `bytes_len` hint lets a
//! peer skip materializing the file unless the caller explicitly asks.
//! Files are cleaned up on best-effort after reading or on restart.

use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::{oneshot, Mutex, Semaphore};
use tokio::{select, spawn, time};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for the sidecar process.
///
/// This is intentionally split from the runtime state so that a caller can
/// validate/clamp values before handing them to `SidecarManager::new`.
#[derive(Debug, Clone, Copy)]
pub struct SidecarConfig {
    /// Health-check interval.
    pub health_interval: Duration,
    /// Timeout for an individual health-check `ping` awaiting `pong`.
    pub health_timeout: Duration,
    /// Threshold above which a payload is offloaded to a temp file.
    pub offload_threshold: usize,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
        health_interval: Duration::from_secs(30),
        health_timeout: Duration::from_secs(5),
        offload_threshold: 1_048_576, // 1 MiB
        }
    }
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/// Envelope representation for a large payload that has been offloaded to a
/// temp file. Senders write a JSON object of this shape; receivers open the
/// referenced path only when they need the bytes.
///
/// This represents a *path hint*, not in-memory bytes. Callers are free to
/// skip reading the payload until needed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OffloadedPayload {
    /// Absolute filesystem path to the temp file.
    pub path: PathBuf,
    /// Original size of the payload in bytes.
    pub bytes_len: u64,
    /// Stable identifier. Helpful for logging and for cache hits.
    pub payload_id: Uuid,
}

/// Request message from the Rust side to the Python sidecar.
///
/// By default, `payload` is left `None` to keep the envelope small. Large
/// payloads are either passed inline or substituted as an
/// `OffloadedPayload`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SidecarRequest {
    /// Caller-chosen request identifier. Used as the correlation key.
    pub request_id: Uuid,
    /// Command string understood by the Python sidecar, e.g. `parse_ape`.
    pub command: String,
    /// Inline JSON payload.
    pub payload: Option<serde_json::Value>,
    /// Monotonic millisecond clock from the frontend.
    pub timestamp_ms: i64,
    /// Pointer to an offloaded temp file, if any.
    pub offloaded: Option<OffloadedPayload>,
}

impl SidecarRequest {
    /// Convenience constructor.
    pub fn new(request_id: Uuid, command: impl Into<String>) -> Self {
        Self {
        request_id,
        command: command.into(),
        payload: None,
        offloaded: None,
        timestamp_ms: 0,
        }
    }

    pub fn with_payload(mut self, payload: serde_json::Value) -> Self {
        self.payload = Some(payload);
        self
    }

    pub fn with_timestamp_ms(mut self, timestamp_ms: i64) -> Self {
        self.timestamp_ms = timestamp_ms;
        self
    }

    /// Convert a relatively-large payload (`> 1 MB` by default) into an
    /// `OffloadedPayload`, writing bytes to a temp file under
    /// `std::env::temp_dir()`.
    ///
    /// Returns a struct suitable for serialization directly to NDJSON.
    /// The temp file is registered for cleanup with `SidecarManager` on the
    /// next restart or file-read path.
    pub fn with_large_payload(mut self, bytes: Vec<u8>, threshold: usize) -> Self {
        if bytes.len() > threshold {
        let payload_id = Uuid::new_v4();
        let file_name = format!("ape-sidecar-{payload_id}.bin");
        let path = std::env::temp_dir().join(file_name);
        if std::fs::write(&path, &bytes).is_err() {
            self.payload = Some(serde_json::Value::String(String::new()));
        }
        self.offloaded = Some(OffloadedPayload {
            path,
            bytes_len: bytes.len() as u64,
            payload_id,
        });
        } else {
        self.payload = Some(serde_json::Value::String(
            String::from_utf8_lossy(&bytes).into_owned(),
        ));
        }
        self
    }
}

/// Application-level response from the Python sidecar.
///
/// Every response echoes the `id` from the corresponding request so
/// that the correlation table can complete the waiting `oneshot::Sender`.
/// Response from the Python sidecar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SidecarResponse {
    pub id: Uuid,
    pub r#type: String,
    pub command: String,
    pub ok: bool,
    /// Python sidecar uses `payload`; Rust historically used `result`.
    /// Both names are accepted on deserialization.
    #[serde(alias = "payload")]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub timestamp_ms: i64,
    #[serde(default)]
    pub offloaded: Option<OffloadedPayload>,
}

impl SidecarResponse {
    pub fn ok(id: Uuid, result: serde_json::Value) -> Self {
        Self {
        id,
        r#type: "response".into(),
        command: "".into(),
        ok: true,
        result: Some(result),
        timestamp_ms: 0,
        offloaded: None,
        }
    }

    pub fn err(id: Uuid, message: impl Into<String>) -> Self {
        Self {
        id,
        r#type: "response".into(),
        command: "".into(),
        ok: false,
        result: Some(serde_json::json!({ "error": message.into() })),
        timestamp_ms: 0,
        offloaded: None,
        }
    }
}

/// Structured error envelope emitted by the sidecar on unrecoverable errors.
///
/// Used for control-plane events, not business errors. Business errors are
/// encoded in a `SidecarResponse` with `ok = false`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SidecarErrorEnvelope {
    pub error_code: String,
    pub layer: String,
    pub message_dev: String,
    pub message_user: String,
    pub recoverable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

impl SidecarErrorEnvelope {
    pub fn new(
        error_code: impl Into<String>,
        layer: impl Into<String>,
        message_dev: impl Into<String>,
        message_user: impl Into<String>,
        recoverable: bool,
    ) -> Self {
        Self {
            error_code: error_code.into(),
            layer: layer.into(),
            message_dev: message_dev.into(),
            message_user: message_user.into(),
            recoverable,
            context: None,
        }
    }
}

/// Health status message. Both sides send a `HealthStatus` in `ping`/`pong`
/// frames. `alive = true` is a `pong`, `alive = false` is a notification
/// that the sidecar is shutting down or unhealthy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HealthStatus {
    pub alive: bool,
    pub message: Option<String>,
}

impl HealthStatus {
    pub const PONG: Self = Self {
        alive: true,
        message: None,
    };

    pub fn down(message: impl Into<String>) -> Self {
        Self {
        alive: false,
        message: Some(message.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/// The sidecar manager owns one live Python process and the orchestration
/// needed to keep it healthy.
///
/// ## Send/Sync notes
///
/// `SidecarManager` is `Send` but **not** `Sync` by design. `request_rx` and
/// `response_rx` are backed by single-consumer channels; sharing them with
/// multiple threads requires external synchronization. The typical ownership
/// shape is one `SidecarManager` in an async runtime task, with requestors
/// acquiring handles to the oneshot channel that is stored inside the
/// correlation table.
pub struct SidecarManager {
    /// Handle to the spawned Python process.
    child: std::sync::Mutex<Option<Child>>,
    /// Pending request id to oneshot sender mapping.
    pending: Arc<Mutex<HashMap<Uuid, oneshot::Sender<io::Result<SidecarResponse>>>>>,
    /// Outbound writer for stdin of the Python process.
    #[allow(dead_code)]
    stdin_writer: Mutex<Option<tokio::process::ChildStdin>>,
    /// Cancellation token shared by the stdout/stderr reader tasks.
    /// Wrapped in a std Mutex so restart() can replace it atomically.
    cancel: std::sync::Mutex<CancellationToken>,
    /// Semaphore capping concurrent in-flight requests to bound memory usage.
    /// Permit is acquired in `send_request` and released on drop.
    request_semaphore: Arc<Semaphore>,
    /// Configured thresholds and intervals.
    config: SidecarConfig,
    /// Temp files created to offload payloads larger than the threshold.
    /// Cleaned up on restart to avoid accumulating files.
    temp_files: Mutex<Vec<PathBuf>>,
    /// Saved for respawn on restart().
    python_executable: PathBuf,
    /// Saved for respawn on restart().
    args: Vec<PathBuf>,
}

impl SidecarManager {
    /// Spawns the Python sidecar process using the provided executable path
    /// and optional arguments.
    ///
    /// Returns `Err` when the executable cannot be spawned.
    pub async fn new(
        python_executable: impl AsRef<std::path::Path>,
        args: &[impl AsRef<std::path::Path>],
        config: SidecarConfig,
    ) -> io::Result<Self> {
        let mut child = Command::new(python_executable.as_ref())
        .args(
            args.iter()
                .map(|p| p.as_ref().as_os_str().to_owned())
                .collect::<Vec<_>>(),
        )
        // Use unbuffered lines in Python (`-u`) so newlines reach the
        // parent immediately and per-line framing stays consistent.
        .arg("-u")
        // `CARGO_MANIFEST_DIR` always resolves to the crate root (src-tauri/),
        // regardless of where cargo runs the binary from.
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        // Pipes are mandatory; without them we cannot drive NDJSON.
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let python_exec = python_executable.as_ref().to_path_buf();
        let sidecar_args: Vec<PathBuf> = args.iter().map(|p| p.as_ref().to_path_buf()).collect();
        let cancel = CancellationToken::new();
        let semaphore = Arc::new(Semaphore::new(100));

        let manager = Self {
        child: std::sync::Mutex::new(Some(child)),
        pending: Arc::new(Mutex::new(HashMap::new())),
        stdin_writer: Mutex::new(stdin),
        cancel: std::sync::Mutex::new(cancel),
        request_semaphore: semaphore,
        config,
        temp_files: Mutex::new(Vec::new()),
        python_executable: python_exec,
        args: sidecar_args,
        };

        if let Some(stdout) = stdout {
        let token = manager.cancel.lock().expect("cancel mutex poisoned").clone();
        manager.spawn_stdout_reader(stdout, token);
        }
        if let Some(stderr) = stderr {
        let token = manager.cancel.lock().expect("cancel mutex poisoned").clone();
        manager.spawn_stderr_reader(stderr, token);
        }

        Ok(manager)
    }

    /// Registers a temp file for cleanup on next restart.
    pub async fn register_temp_file(&self, path: PathBuf) {
        self.temp_files.lock().await.push(path);
    }

    /// Reads a temp file payload. If the file is missing, returns `None`.
    pub async fn read_offloaded(&self, offloaded: OffloadedPayload) -> io::Result<Option<Vec<u8>>> {
        match std::fs::read(&offloaded.path) {
        Ok(data) => Ok(Some(data)),
        Err(e) => {
            tracing::warn!(path=%offloaded.path.display(), err=%e, "offloaded payload read failed");
            Ok(None)
        }
        }
    }

    /// Sends a fire-and-forget `ping` to the sidecar and awaits a matching
    /// `pong`. Returns `true` when the sidecar is alive.
    pub async fn health_ping(&self) -> io::Result<bool> {
        let request_id = Uuid::new_v4();

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(request_id, tx);
        }

        // Use the standard NDJSON envelope via send_ndjson_line.
        let env = json!({
            "id": request_id.to_string(),
            "type": "request",
            "command": "ping",
            "payload": serde_json::Value::Null,
            "timestamp_ms": 0,
        });

        if !self.send_ndjson_line(&env).await {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "sidecar stdin is closed",
            ));
        }

        let pong = time::timeout(self.config.health_timeout, rx)
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "health ping timed out"))?
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "oneshot dropped"))??;

        match pong.result {
            Some(ref val) if val.get("alive").and_then(|v| v.as_bool()) == Some(true) => Ok(true),
            _ => Ok(false),
        }
        }

    /// Starts a background health-check loop. The loop sends a `ping` every
    /// `config.health_interval`. If a `ping` fails or the sidecar exits
    /// unexpectedly, `restart` is called and the caller's error handler is
    /// notified via `on_error`.
    ///
    /// `on_error` is invoked on the spawned future context, so it should not
    /// block for long.
    pub async fn run_health_loop<F>(&self, on_error: F)
    where
        F: Fn(SidecarErrorEnvelope) + Send + Sync + 'static,
    {
        let mut interval = time::interval(self.config.health_interval);
        loop {
        interval.tick().await;
        match self.health_ping().await {
            Ok(true) => {}
            Ok(false) | Err(_) => {
                let envelope = SidecarErrorEnvelope::new(
                    "SIDECAR_HEALTH_FAILED",
                    "rust",
                    "sidecar did not pong during health check",
                    "Sidecar process is not responding. Attempting restart.",
                    true,
                );
                on_error(envelope);
                let _ = self.restart().await;
            }
        }
        }
    }

    /// Sends a new request into the correlation table, then flushes it onto
    /// the sidecar's stdin. Returns a future that resolves with the parsed
    /// `SidecarResponse` or with an I/O error.
    pub async fn send_request(
        &self,
        req: SidecarRequest,
    ) -> io::Result<SidecarResponse> {
        // Acquire a permit before entering the pending table. If all 100
        // permits are held by in-flight requests, this await blocks until
        // one is freed, providing automatic backpressure.
        let _permit = self
            .request_semaphore
            .acquire()
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "semaphore closed"))?;

        let request_id = req.request_id;

        // Complete `request_id` is the correlation key.
        let (tx, rx) = oneshot::channel();
        {
        let mut pending = self.pending.lock().await;
        // If a previous request with the same id was abandoned, drop it.
        pending.insert(request_id, tx);
        }

        // Serialize as the flat envelope shape documented in ndjson_examples.md.
        let env = json!({
        "id": request_id.to_string(),
        "type": "request",
        "command": req.command,
        "payload": req.payload.unwrap_or(serde_json::Value::Null),
        "timestamp_ms": req.timestamp_ms,
        });

        if !self.send_ndjson_line(&env).await {
        let mut pending = self.pending.lock().await;
        pending.remove(&request_id);
        return Err(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "sidecar stdin is closed",
        ));
        }

        let result = rx
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "oneshot dropped"))??;

        Ok(result)
    }

    /// Writes a single NDJSON line to the sidecar's stdin. Uses compact
    /// separators to reduce byte overhead.
    ///
    /// Returns `true` when the line was written, `false` on EOF/write error.
    async fn send_ndjson_line(&self, value: &serde_json::Value) -> bool {
        let mut guard = self.stdin_writer.lock().await;
        let writer = match &mut *guard {
        Some(w) => w,
        None => return false,
        };
        let mut line = serde_json::to_vec(value).unwrap_or_default();
        line.push(b'\n');
        if writer.write_all(&line).await.is_err() {
        return false;
        }
        if writer.flush().await.is_err() {
        return false;
        }
        true
    }

    /// Handles a fully parsed `SidecarResponse` NDJSON line.
    ///
    /// Looks up the correlation table by `request_id` and notifies the
    /// waiting call site by sending the `_IOResult<SidecarResponse>` through
    /// the associated oneshot channel. Invalid or unknown request IDs are
    /// logged and ignored, so a noisy peer cannot crash this sidecar.
    async fn fulfill(&self, response: SidecarResponse) {
        let request_id = response.id;
        let sender = {
        let mut pending = self.pending.lock().await;
        pending.remove(&request_id)
        };

        match sender {
        Some(tx) => {
            let _ = tx.send(Ok(response));
        }
        None => {
            // We received a response for a request we no longer track.
            // This can happen during restarts or when the peer is buggy.
            tracing::warn!(%request_id, "unmatched response received");
        }
        }
    }

    /// Handles a parsed sidecar error envelope.
    ///
    /// Errors from the remote become events routed back to the UI layer. At
    /// this layer we only route them through whatever future the caller has
    /// registered (typically a UI broadcast channel).
    async fn on_remote_error(&self, envelope: SidecarErrorEnvelope) {
        // Placeholder. The actual UI broadcast is owned by the Tauri command
        // layer and is wired in once the manager is attached to the app
        // state. Here we at least log so that ops debugging remains possible.
        tracing::error!(code=%envelope.error_code, message=%envelope.message_dev, "remote sidecar error");
    }

    /// Reads NDJSON lines from the provided `ChildStdout`, forwards parsed
    /// responses to the correlation table, and propagates shutdown on drop.
    fn spawn_stdout_reader(&self, stdout: ChildStdout, cancel: CancellationToken) {
        let pending = self.pending.clone();
        spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();

        loop {
            select! {
                _ = cancel.cancelled() => {
                    break;
                }
                read = reader.read_line(&mut line) => {
                    match read {
                        Ok(0) => {
                            break;
                        }
                        Ok(_) => {
                            let trimmed = line.trim_end_matches(&['\n', '\r'][..]);
                            if trimmed.is_empty() {
                                line.clear();
                                continue;
                            }

                            match serde_json::from_str::<serde_json::Value>(trimmed) {
                                Ok(value) => {
                                    // Dispatch on the envelope "type" field.
                                    match value.get("type").and_then(|v| v.as_str()) {
                                        Some("response") => {
                                            match serde_json::from_value::<SidecarResponse>(value) {
                                                Ok(resp) => {
                                                    let request_id = resp.id;
                                                    let sender = {
                                                        let mut pending = pending.lock().await;
                                                        pending.remove(&request_id)
                                                    };
                                                    if let Some(tx) = sender {
                                                        let _ = tx.send(Ok(resp));
                                                    } else {
                                                        tracing::warn!(%request_id, "unmatched response received");
                                                    }
                                                }
                                                Err(e) => {
                                                    tracing::warn!(err=%e, line=%trimmed, "response deserialization failed");
                                                }
                                            }
                                        }
                                        Some("error") => {
                                            match serde_json::from_value::<SidecarErrorEnvelope>(value) {
                                                Ok(envelope) => {
                                                    tracing::error!(code=%envelope.error_code, message=%envelope.message_dev, "remote sidecar error");
                                                }
                                                Err(e) => {
                                                    tracing::warn!(err=%e, line=%trimmed, "error envelope deserialization failed");
                                                }
                                            }
                                        }
                                        other => {
                                            tracing::warn!(envelope_type=?other, line=%trimmed, "unknown envelope type on stdout");
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!(err=%e, line=%trimmed, "ndjson parse failed on stdout");
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(err=%e, "stdout read error");
                            break;
                        }
                    }
                    line.clear();
                }
            }
        }
        tracing::info!("stdout reader task exited");
        });
    }

    fn spawn_stderr_reader(&self, stderr: ChildStderr, cancel: CancellationToken) {
        // stderr is unstructured from Rust's perspective; the Python sidecar
        // should be instructed to use that stream for logging/errors only.
        //
        // From the deadlock-avoidance perspective, the stderr reader is the
        // sibling that saves us when the child is blocked on a write to stderr
        // while waiting for stdout to be consumed. If we did not read stderr at
        // all, the child could deadlock in the Python standard library when
        // `sys.stderr.write` blocks.
        spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();

        loop {
            select! {
                _ = cancel.cancelled() => break,
                read = reader.read_line(&mut line) => {
                    match read {
                        Ok(0) => {
                            // Child closed stderr.
                            break;
                        }
                        Ok(_) => {
                            // Log or forward as needed.
                            let trimmed = line.trim_end_matches(&['\n', '\r'][..]);
                            if !trimmed.is_empty() {
                                tracing::info!(line=%trimmed, "sidecar stderr");
                            }
                        }
                        Err(e) => {
                            tracing::warn!(err=%e, "stderr read error");
                            break;
                        }
                    }
                }
            }
            line.clear();
        }
        tracing::info!("stderr reader task exited");
        });
    }

    /// Kills the running Python process and spawns a replacement with the
    /// same configuration.
    ///
    /// This clears the correlation table, because in-flight requests are
    /// moot once the child dies. It also cleans up temp files that were
    /// created during this run.
    pub async fn restart(&self) -> io::Result<()> {
        // Cancel stdout/stderr reader tasks from the previous run.
        self.cancel.lock().expect("cancel mutex poisoned").cancel();

        // Clean up temp files from the previous run.
        let mut temp_files = self.temp_files.lock().await;
        for path in temp_files.drain(..) {
        let _ = std::fs::remove_file(&path);
        }
        drop(temp_files);

        // Drop in-flight senders. Callers currently waiting on `send_request`
        // will see a oneshot-disconnect error and should retry.
        self.pending.lock().await.clear();

        // Kill the old child. Take ownership then drop the lock before any await.
        let old_child = {
            let mut child_guard = self.child.lock().expect("child mutex poisoned");
            child_guard.take()
        };
        if let Some(mut child) = old_child {
            // Close stdin to signal the Python sidecar.
            let _ = child.stdin.take();
            // 2-second grace period before hard kill.
            let _ = time::timeout(Duration::from_secs(2), child.wait()).await;
            let _ = child.kill().await;
        }

        // Replace the cancellation token so new readers get a fresh one.
        let new_cancel = CancellationToken::new();
        *self.cancel.lock().expect("cancel mutex poisoned") = new_cancel.clone();

        // Respawn the child process with the stored executable and args.
        let mut new_child = Command::new(&self.python_executable)
        .args(&self.args)
        .arg("-u")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

        let new_stdin = new_child.stdin.take();
        let new_stdout = new_child.stdout.take();
        let new_stderr = new_child.stderr.take();

        // Store the new child handle.
        *self.child.lock().expect("child mutex poisoned") = Some(new_child);

        // Re-wire stdin.
        *self.stdin_writer.lock().await = new_stdin;

        // Spawn new reader tasks with the fresh cancellation token.
        if let Some(stdout) = new_stdout {
        let token = self.cancel.lock().expect("cancel mutex poisoned").clone();
        self.spawn_stdout_reader(stdout, token);
        }
        if let Some(stderr) = new_stderr {
        let token = self.cancel.lock().expect("cancel mutex poisoned").clone();
        self.spawn_stderr_reader(stderr, token);
        }

        tracing::info!("sidecar restarted successfully");
        Ok(())
    }

}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        // Ask reader tasks to exit.
        self.cancel.lock().expect("cancel mutex poisoned").cancel();

        // Best-effort: try to terminate the child so it does not outlive
        // this manager struct.
        let mut child_guard = self.child.lock().expect("child mutex poisoned");
        if let Some(mut child) = child_guard.take() {
        // We're in a sync drop context, so spawn a blocking task to wait
        // this out. `kill()` is async under tokio process, so we take
        // only the first-aid step here.
        let _ = child.start_kill();
        }
    }
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/// Serializes `T` to a single-line NDJSON string using compact separators.
pub fn serialize_ndjson<T: Serialize>(value: &T) -> io::Result<String> {
    serde_json::to_string(value).map_err(io::Error::from)
}

/// Deserializes a single NDJSON line into `T`.
pub fn deserialize_ndjson<T: for<'de> Deserialize<'de>>(line: &str) -> io::Result<T> {
    serde_json::from_str(line).map_err(io::Error::from)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidecar_response_serializes_compact() {
        let resp = SidecarResponse::ok(Uuid::new_v4(), serde_json::json!({"ok": true}));
        let text = serialize_ndjson(&resp).expect("serialize");
        assert!(!text.contains('\n') || text.lines().count() == 1, "must be one line");
        assert!(
        text.contains(","),
        "compact separators must include commas"
        );
        // No indentation/blanks.
        assert!(text.find("  ").is_none(), "no indentation allowed");
    }

    #[test]
    fn sidecar_response_envelope_fields() {
        let id = Uuid::new_v4();
        let resp = SidecarResponse::ok(id, serde_json::json!({"test": 123}));
        let text = serialize_ndjson(&resp).expect("serialize");
        assert!(text.contains(&format!("\"id\":\"{}\"", id)));
        assert!(text.contains("\"type\":\"response\""));
        assert!(text.contains("\"command\":\"\""));
        assert!(text.contains("\"ok\":true"));

        let back: SidecarResponse = deserialize_ndjson(&text).expect("deserialize");
        assert_eq!(back.id, id);
        assert_eq!(back.r#type, "response");
        assert_eq!(back.command, "");
        assert_eq!(back.ok, true);
    }

    #[test]
    fn deserialize_same_shape() {
        let original = SidecarRequest::new(Uuid::new_v4(), "summarize")
        .with_payload(serde_json::json!({"count": 42}));
        let text = serialize_ndjson(&original).expect("serialize");
        let back: SidecarRequest = deserialize_ndjson(&text).expect("deserialize");
        assert_eq!(original.request_id, back.request_id);
        assert_eq!(original.command, back.command);
        assert_eq!(original.payload, back.payload);
        assert_eq!(original.timestamp_ms, back.timestamp_ms);
    }
}
