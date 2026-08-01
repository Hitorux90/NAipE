// src-tauri/src/lib.rs
// Library root for the Tauri application.
// Declares modules, defines the Tauri builder, and exports `run()`.

#![allow(dead_code)]

pub mod db;
pub mod sidecar;
pub mod undo;

use db::schema::run_schema;
use db::seed::{load_default_parts, seed_if_empty};
use db::DbPool;
use db::models::{Part, Sequence};
use sidecar::{SidecarConfig, SidecarManager, SidecarRequest, SidecarResponse};
use std::path::PathBuf;
use tauri::Manager;
use chrono::Utc;
use std::sync::Mutex;
use undo::{UndoManager, UndoEntry};
use uuid::Uuid;

pub async fn inner_create_sequence(
    pool: &DbPool,
    name: &str,
    sequence: &str,
    topology: &str,
) -> sqlx::Result<Sequence> {
    let now_ms = Utc::now().timestamp_millis();
    let length_bp = sequence.len() as i64;

    sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::INSERT)
        .bind(name)
        .bind(sequence)
        .bind(topology)
        .bind(length_bp)
        .bind(now_ms)
        .fetch_one(pool)
        .await
}

pub async fn fetch_sequences(pool: &DbPool) -> sqlx::Result<Vec<Sequence>> {
    sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::ALL)
        .fetch_all(pool)
        .await
}

pub async fn save_dna_to_file(
    pool: &DbPool,
    sequence_id: i64,
    target_path: &std::path::Path,
) -> anyhow::Result<std::path::PathBuf> {
    let seq = sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::BY_ID)
        .bind(sequence_id)
        .fetch_one(pool)
        .await?;

    let text = serde_json::to_string_pretty(&serde_json::json!({
        "version": "0.1",
        "format": "NAipE-dna",
        "name": seq.name,
        "sequence": seq.sequence,
        "length_bp": seq.length_bp,
        "topology": seq.topology,
        "created_at_ms": seq.created_at_ms,
        "parts": []
    }))?;

    std::fs::write(target_path, text)?;
    Ok(target_path.to_path_buf())
}

pub async fn save_fasta_to_file(
    pool: &DbPool,
    sequence_id: i64,
    target_path: &std::path::Path,
) -> anyhow::Result<std::path::PathBuf> {
    let seq = sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::BY_ID)
        .bind(sequence_id)
        .fetch_one(pool)
        .await?;

    let header = format!(">{} length={} topology={}", seq.name, seq.length_bp, seq.topology);
    let text = format!("{}\n{}\n", header, seq.sequence);
    std::fs::write(target_path, text)?;
    Ok(target_path.to_path_buf())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SidecarError {
    error: String,
    message: String,
}

async fn send_sidecar_request(
    state: &tauri::State<'_, SidecarManager>,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let manager = state.inner();
    let req = SidecarRequest::new(Uuid::new_v4(), command)
        .with_payload(payload)
        .with_timestamp_ms(Utc::now().timestamp_millis());

    match manager.send_request(req).await {
        Ok(SidecarResponse { ok: true, result, .. }) => {
            result.ok_or_else(|| "INTERNAL_ERROR|empty sidecar response".to_string())
        }
        Ok(SidecarResponse { ok: false, result, .. }) => {
            let detail = result.unwrap_or_default();
            if let Some(code) = detail.get("error").and_then(|v| v.as_str()) {
                if let Some(msg) = detail.get("message").and_then(|v| v.as_str()) {
                    return Err(format!("{}|{}", code, msg));
                }
                return Err(code.to_string());
            }
            Err("INTERNAL_ERROR|sidecar returned ok=false without error code".to_string())
        }
        Err(io_err) => Err(format!("IO_ERROR|{}", io_err)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .try_init();

    tauri::Builder::default()
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                let app_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                    .unwrap_or_else(|| PathBuf::from("."));
                std::fs::create_dir_all(&app_dir).expect("create app data dir");

                let db_path = app_dir.join("ape.db");
                let db_url = format!(
                    "sqlite:{}?mode=rwc",
                    db_path.to_string_lossy().replace('\\', "/")
                );
                let pool = match sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                {
                    Ok(pool) => pool,
                    Err(err) => {
                        eprintln!("[ApE] failed to connect to SQLite: {err}");
                        return Ok(());
                    }
                };

                if let Err(err) = run_schema(&mut pool.acquire().await.expect("acquire db connection")).await {
                    eprintln!("[ApE] failed to run schema: {err}");
                    return Ok(());
                }

                let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                let seed_path = crate_dir
                    .join("test_data")
                    .join("default_parts_seed.json");
                let default_parts = match load_default_parts(&seed_path).await {
                    Ok(parts) => parts,
                    Err(err) => {
                        eprintln!("[ApE] failed to load seed parts: {err}");
                        Vec::new()
                    }
                };

                if let Err(err) = seed_if_empty(
                    &mut pool.acquire().await.expect("acquire db connection"),
                    &default_parts,
                )
                .await
                {
                    eprintln!("[ApE] failed to seed parts library: {err}");
                }

                let python_candidate = std::env::var("APEPYTHON")
                    .or_else(|_| std::env::var("PYTHON"))
                    .unwrap_or_else(|_| {
                        if cfg!(windows) {
                            r"C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe"
                                .to_string()
                        } else {
                            "python3".to_string()
                        }
                    });

                let sidecar_result = SidecarManager::new(
                    &python_candidate,
                    &[std::path::Path::new(&python_candidate)],
                    SidecarConfig::default(),
                )
                .await;

                let sidecar_manager = match sidecar_result {
                    Ok(manager) => manager,
                    Err(err) => {
                        eprintln!("[ApE] failed to start sidecar: {err}");
                        return Ok(());
                    }
                };

                app.manage(pool);
                app.manage(sidecar_manager);
                app.manage(Mutex::new(UndoManager::new()));

                Ok(())
            })
        })
        .invoke_handler(tauri::generate_handler![greet, get_parts, create_sequence, new_sequence, list_sequences, save_dna, save_fasta, open_file, save_as_dna, save_as_fasta, save_as_gb, open_sequence, undo, redo])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! New ApE scaffold is ready.", name)
}

#[tauri::command]
async fn get_parts(state: tauri::State<'_, DbPool>) -> Result<Vec<Part>, String> {
    sqlx::query_as::<_, Part>(db::models::PartQueries::ALL)
        .fetch_all(&*state)
        .await
        .map_err(|e| format!("DB_ERROR|{}", e))
}

#[tauri::command]
async fn create_sequence(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence: String,
    topology: String,
) -> Result<Sequence, String> {
    inner_create_sequence(&*state, &name, &sequence, &topology)
        .await
        .map_err(|e| format!("DB_ERROR|{}", e))
}

#[tauri::command]
async fn new_sequence(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence: String,
    topology: String,
) -> Result<Sequence, String> {
    inner_create_sequence(&*state, &name, &sequence, &topology)
        .await
        .map_err(|e| format!("DB_ERROR|{}", e))
}

#[tauri::command]
async fn list_sequences(state: tauri::State<'_, DbPool>) -> Result<Vec<Sequence>, String> {
    sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::ALL)
        .fetch_all(&*state)
        .await
        .map_err(|e| format!("DB_ERROR|{}", e))
}

#[tauri::command]
async fn save_dna(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    if sequence_id == 0 {
        return Err("DB_ERROR|save_dna requires an existing sequence".to_string());
    }
    save_dna_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("IO_ERROR|{}", e))
}

#[tauri::command]
async fn save_fasta(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_fasta_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("IO_ERROR|{}", e))
}

#[tauri::command]
async fn open_file(
    sidecar: tauri::State<'_, SidecarManager>,
    target_path: String,
) -> Result<Sequence, String> {
    open_sequence(sidecar, target_path).await
}

#[tauri::command]
async fn save_as_dna(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_dna_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("IO_ERROR|{}", e))
}

#[tauri::command]
async fn save_as_fasta(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_fasta_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("IO_ERROR|{}", e))
}

#[tauri::command]
async fn save_as_gb(
    pool: tauri::State<'_, DbPool>,
    sidecar: tauri::State<'_, SidecarManager>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    let seq = sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::BY_ID)
        .bind(sequence_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| format!("DB_ERROR|{}", e))?;

    let payload = serde_json::json!({
        "name": seq.name,
        "sequence": seq.sequence,
        "topology": seq.topology,
        "length_bp": seq.length_bp,
        "target_path": target_path,
    });

    let result = send_sidecar_request(&sidecar, "save_as_gb", payload).await?;
    Ok(result.get("path").and_then(|v| v.as_str()).unwrap_or(&target_path).to_string())
}

#[tauri::command]
async fn open_sequence(
    sidecar: tauri::State<'_, SidecarManager>,
    target_path: String,
) -> Result<Sequence, String> {
    let payload = serde_json::json!({"target_path": target_path});
    let result = send_sidecar_request(&sidecar, "open_sequence", payload).await?;

    Ok(Sequence {
        id: 0,
        name: result.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed").to_string(),
        sequence: result.get("sequence").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        topology: result.get("topology").and_then(|v| v.as_str()).unwrap_or("circular").to_string(),
        length_bp: result.get("length_bp").and_then(|v| v.as_i64()).unwrap_or_default(),
        created_at_ms: 0,
    })
}

#[tauri::command]
async fn undo(
    state: tauri::State<'_, Mutex<UndoManager>>,
    sequence_id: i64,
) -> Result<Option<UndoEntry>, String> {
    let mut manager = state.lock().map_err(|e| format!("LOCK_ERROR|{}", e))?;
    Ok(manager.undo(sequence_id))
}

#[tauri::command]
async fn redo(
    state: tauri::State<'_, Mutex<UndoManager>>,
    sequence_id: i64,
) -> Result<Option<UndoEntry>, String> {
    let mut manager = state.lock().map_err(|e| format!("LOCK_ERROR|{}", e))?;
    Ok(manager.redo(sequence_id))
}
