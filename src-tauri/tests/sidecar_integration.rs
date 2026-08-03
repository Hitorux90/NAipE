//! End-to-end sidecar integration tests.
//!
//! Each test spawns a fresh Python sidecar process, sends NDJSON requests,
//! and verifies the response. Tests are async (`#[tokio::test]`) because
//! `SidecarManager::new()` requires a tokio runtime.

use std::path::PathBuf;

use apetauri_lib::sidecar::{
    SidecarConfig, SidecarManager, SidecarRequest,
};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Finds a working Python 3 interpreter on this Windows host.
fn find_python() -> PathBuf {
    std::env::var("APEPYTHON")
        .or_else(|_| std::env::var("PYTHON"))
        .unwrap_or_else(|_| {
            r"C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe".to_string()
        })
        .into()
}

/// Resolves the sidecar script relative to the project root.
fn find_sidecar_script() -> PathBuf {
    let manifest: PathBuf = env!("CARGO_MANIFEST_DIR").into();
    // Try python-core first (primary sidecar), then sidecar/__main__.py (alt).
    let primary = manifest
        .parent()
        .unwrap()
        .join("python-core")
        .join("sidecar_console.py");
    let alt = manifest.join("sidecar").join("__main__.py");
    if primary.exists() { primary } else { alt }
}

/// Spawn a `SidecarManager` with default config, panicking on failure.
async fn spawn_manager() -> SidecarManager {
    let python = find_python();
    let script = find_sidecar_script();
    assert!(
        python.exists(),
        "Python executable not found at {}",
        python.display()
    );
    assert!(
        script.exists(),
        "Sidecar script not found at {}",
        script.display()
    );
    SidecarManager::new(&python, &[script], SidecarConfig::default())
        .await
        .expect("failed to spawn sidecar manager")
}

/// Helper to send a simple command with an empty payload.
async fn send(
    manager: &SidecarManager,
    command: &str,
) -> apetauri_lib::sidecar::SidecarResponse {
    let req = SidecarRequest::new(Uuid::new_v4(), command)
        .with_payload(serde_json::json!({}));
    manager.send_request(req).await.expect("send_request failed")
}

// ---------------------------------------------------------------------------
// Test 1: Normal Lifecycle — send a parse_ape command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_parse_ape_command() {
    let manager = spawn_manager().await;

    let req = SidecarRequest::new(Uuid::new_v4(), "parse_ape")
        .with_payload(serde_json::json!({
            "content": "ATGCATGC",
            "id": "test-seq-1",
        }));

    let response = manager.send_request(req).await.expect("send_request failed");

    assert!(response.ok, "parse_ape should succeed");
    let result = response.result.expect("result should be present");

    // The Python handler returns: id, name, sequence, topology, annotations, length_bp
    assert_eq!(result.get("name").and_then(|v| v.as_str()), Some("parsed"));
    assert_eq!(
        result.get("sequence").and_then(|v| v.as_str()),
        Some("ATGCATGC")
    );
    assert_eq!(
        result.get("topology").and_then(|v| v.as_str()),
        Some("circular")
    );
    assert_eq!(result.get("length_bp").and_then(|v| v.as_i64()), Some(8));

    // manager dropped here → Drop kills child
}

// ---------------------------------------------------------------------------
// Test 2: Health Check — ping/pong
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_health_ping() {
    let manager = spawn_manager().await;

    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "sidecar should report alive");
}

// ---------------------------------------------------------------------------
// Test 3: Auto-Restart — restart and send again
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_restart_and_send() {
    let manager = spawn_manager().await;

    // Confirm alive before restart.
    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "pre-restart health ping should succeed");

    // Restart and confirm alive again.
    manager.restart().await.expect("restart failed");

    let alive2 = manager.health_ping().await.expect("post-restart health_ping failed");
    assert!(alive2, "post-restart health ping should succeed");
}

// ---------------------------------------------------------------------------
// Test 4: Error Envelope — unknown command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_unknown_command_error() {
    let manager = spawn_manager().await;

    let resp = send(&manager, "nonexistent_command").await;

    assert!(!resp.ok, "unknown command should fail");
    let result = resp.result.expect("result should be present");
    assert!(
        result.get("error").is_some()
            || result.as_str().map(|s| s.contains("unknown")).unwrap_or(false),
        "result should contain an error about unknown command, got: {}",
        result
    );
}

// ---------------------------------------------------------------------------
// Test 5: Temp File Offloading — large payload triggers offload
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_large_payload_offloading() {
    let manager = spawn_manager().await;

    // Build a large string payload (200 bytes, well above 100 threshold).
    let large_content = "A".repeat(200);
    let req = SidecarRequest::new(Uuid::new_v4(), "ping")
        .with_large_payload(large_content.as_bytes().to_vec(), 100);

    // After with_large_payload, the request should have offloaded=true
    assert!(
        req.offloaded.is_some(),
        "payload > 100 bytes should be offloaded"
    );

    // The offloaded path should exist on disk.
    let offloaded_path = req.offloaded.as_ref().unwrap().path.clone();
    assert!(
        offloaded_path.exists(),
        "offloaded temp file should exist at {}",
        offloaded_path.display()
    );

    // Send the request. The "ping" handler ignores payload,
    // so it should succeed even with a null inline payload.
    let response = manager
        .send_request(req)
        .await
        .expect("send_request with offloaded payload failed");

    assert!(response.ok, "offloaded request should succeed");
}

// ---------------------------------------------------------------------------
// Additional smoke: send multiple stub commands in sequence
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_multiple_commands_same_connection() {
    let manager = spawn_manager().await;

    // Test health_ping.
    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "ping should report alive");

    // Test each stub command with minimal payloads.
    let tests: &[(&str, serde_json::Value)] = &[
            ("ping", serde_json::json!({})),
            ("create_sequence", serde_json::json!({"name": "t", "sequence": "ATGC", "topology": "circular"})),
            ("list_parts", serde_json::json!({})),
        ];

    for (cmd, payload) in tests {
        let req = SidecarRequest::new(Uuid::new_v4(), *cmd).with_payload(payload.clone());
        let resp = manager.send_request(req).await.expect("send_request failed");
        assert!(resp.ok, "command '{}' should succeed, got: {:?}", cmd, resp.result);
    }
}