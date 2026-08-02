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
use sqlx::Row;
use std::path::PathBuf;
use tauri::Manager;
use chrono::Utc;
use std::sync::Mutex;
use std::sync::Arc;
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct SidecarError {
    pub error: String,
    pub message: String,
}

impl std::fmt::Display for SidecarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}|{}", self.error, self.message)
    }
}

impl std::error::Error for SidecarError {}

async fn send_sidecar_request(
    state: &tauri::State<'_, Arc<SidecarManager>>,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, SidecarError> {
    let manager = state.inner().as_ref();
    let req = SidecarRequest::new(Uuid::new_v4(), command)
        .with_payload(payload)
        .with_timestamp_ms(Utc::now().timestamp_millis());

    match manager.send_request(req).await {
        Ok(SidecarResponse { ok: true, result, .. }) => {
            result.ok_or_else(|| SidecarError {
                error: "INTERNAL_ERROR".into(),
                message: "empty sidecar response".into(),
            })
        }
        Ok(SidecarResponse { ok: false, result, .. }) => {
            let detail = result.unwrap_or_default();
            if let Some(code) = detail.get("error").and_then(|v| v.as_str()) {
                if let Some(msg) = detail.get("message").and_then(|v| v.as_str()) {
                    return Err(SidecarError {
                        error: code.into(),
                        message: msg.into(),
                    });
                }
                return Err(SidecarError {
                    error: code.into(),
                    message: String::new(),
                });
            }
            Err(SidecarError {
                error: "INTERNAL_ERROR".into(),
                message: "sidecar returned ok=false without error code".into(),
            })
        }
        Err(io_err) => Err(SidecarError {
            error: "IO_ERROR".into(),
            message: io_err.to_string(),
        }),
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

                let empty_args: [&std::path::Path; 0] = [];
                let sidecar_result = SidecarManager::new(
                    &python_candidate,
                    &empty_args,
                    SidecarConfig::default(),
                )
                .await;

                let sidecar_manager = match sidecar_result {
                    Ok(manager) => Arc::new(manager),
                    Err(err) => {
                        eprintln!("[ApE] failed to start sidecar: {err}");
                        return Ok(());
                    }
                };

                // Spawn background health loop to detect and recover from sidecar crashes.
                let sidecar_for_health = Arc::clone(&sidecar_manager);
                tauri::async_runtime::spawn(async move {
                    sidecar_for_health.run_health_loop(|err_env| {
                        tracing::error!(code=%err_env.code, msg=%err_env.message, "Sidecar health error");
                    }).await;
                });

                app.manage(pool);
                app.manage(sidecar_manager);
                app.manage(Mutex::new(UndoManager::new()));

                Ok(())
            })
        })
        .invoke_handler(tauri::generate_handler![greet, get_parts, create_sequence, new_sequence, list_sequences, save_dna, save_fasta, open_file, save_as_dna, save_as_fasta, save_as_gb, open_sequence, create_construct, add_part_to_construct, save_construct, list_constructs, open_construct, create_annotation, list_annotations, undo, redo])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! New ApE scaffold is ready.", name)
}

#[tauri::command]
async fn get_parts(state: tauri::State<'_, DbPool>) -> Result<Vec<Part>, SidecarError> {
    sqlx::query_as::<_, Part>(db::models::PartQueries::ALL)
        .fetch_all(&*state)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn create_sequence(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence: String,
    topology: String,
) -> Result<Sequence, SidecarError> {
    inner_create_sequence(&*state, &name, &sequence, &topology)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn new_sequence(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence: String,
    topology: String,
) -> Result<Sequence, SidecarError> {
    inner_create_sequence(&*state, &name, &sequence, &topology)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn list_sequences(state: tauri::State<'_, DbPool>) -> Result<Vec<Sequence>, SidecarError> {
    sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::ALL)
        .fetch_all(&*state)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn save_dna(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    use std::path::Path;
    let path = Path::new(&target_path);
    if sequence_id == 0 {
        return Err(SidecarError { error: "DB_ERROR".into(), message: "save_dna requires an existing sequence".into() });
    }
    save_dna_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| SidecarError { error: "IO_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn save_fasta(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_fasta_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| SidecarError { error: "IO_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn open_file(
    sidecar: tauri::State<'_, Arc<SidecarManager>>,
    target_path: String,
) -> Result<Sequence, SidecarError> {
    open_sequence(sidecar, target_path).await
}

#[tauri::command]
async fn save_as_dna(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_dna_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| SidecarError { error: "IO_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn save_as_fasta(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_fasta_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| SidecarError { error: "IO_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn save_as_gb(
    pool: tauri::State<'_, DbPool>,
    sidecar: tauri::State<'_, Arc<SidecarManager>>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    let seq = sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::BY_ID)
        .bind(sequence_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })?;

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
    sidecar: tauri::State<'_, Arc<SidecarManager>>,
    target_path: String,
) -> Result<Sequence, SidecarError> {
    let payload = serde_json::json!({"target_path": target_path});
    let result = send_sidecar_request(&sidecar, "open_sequence", payload).await?;

    Ok(Sequence {
        id: result.get("id").and_then(|v| v.as_i64()).unwrap_or_default(),
        name: result.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed").to_string(),
        sequence: result.get("sequence").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        topology: result.get("topology").and_then(|v| v.as_str()).unwrap_or("circular").to_string(),
        length_bp: result.get("length_bp").and_then(|v| v.as_i64()).unwrap_or_default(),
        created_at_ms: 0,
    })
}

pub async fn db_create_construct(
    pool: &DbPool,
    name: String,
    sequence_id: i64,
) -> sqlx::Result<i64> {
    let now_ms = Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO Constructs (name, sequence_id, created_at_ms) VALUES (?, ?, ?)")
        .bind(&name)
        .bind(sequence_id)
        .bind(now_ms)
        .execute(pool)
        .await
        .map(|r| r.last_insert_rowid())
}

pub async fn db_add_part_to_construct(
    pool: &DbPool,
    construct_id: i64,
    part_id: String,
    start: i64,
    end: i64,
    strand: i64,
    color: Option<String>,
    order: i64,
) -> sqlx::Result<i64> {
    let now_ms = Utc::now().timestamp_millis();
    sqlx::query(r#"INSERT INTO Construct_Parts (construct_id, part_id, start, end, strand, color, "order", created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#)
        .bind(construct_id)
        .bind(&part_id)
        .bind(start)
        .bind(end)
        .bind(strand)
        .bind(&color)
        .bind(order)
        .bind(now_ms)
        .execute(pool)
        .await
        .map(|r| r.last_insert_rowid())
}

pub async fn db_save_construct(
    pool: &DbPool,
    construct_id: i64,
    target_path: String,
) -> anyhow::Result<String> {
    let row = sqlx::query("SELECT name, sequence_id, created_at_ms FROM Constructs WHERE id = ?")
        .bind(construct_id)
        .fetch_optional(pool)
        .await?;

    let (name, sequence_id, _created_at_ms) = row.map(|r| {
        (
            r.get::<String, _>("name"),
            r.get::<i64, _>("sequence_id"),
            r.get::<i64, _>("created_at_ms"),
        )
    }).unwrap_or(("unnamed".into(), 0, 0));

    let parts: Vec<serde_json::Value> = sqlx::query(r#"SELECT part_id, start, end, strand, color, "order" FROM Construct_Parts WHERE construct_id = ? ORDER BY "order""#)
        .bind(construct_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "part_id": row.get::<String, _>("part_id"),
                "start": row.get::<i64, _>("start"),
                "end": row.get::<i64, _>("end"),
                "strand": row.get::<i64, _>("strand"),
                "color": row.get::<Option<String>, _>("color"),
                "order": row.get::<i64, _>("order"),
            })
        })
        .collect();

    let data = serde_json::json!({
        "name": name,
        "construct_id": construct_id,
        "sequence_id": sequence_id,
        "parts": parts,
    });

    use std::path::Path;
    let path = Path::new(&target_path);
    std::fs::create_dir_all(path.parent().unwrap_or(path)).ok();
    std::fs::write(path, serde_json::to_string_pretty(&data)?)?;

    Ok(target_path)
}

pub async fn db_list_constructs(pool: &DbPool) -> sqlx::Result<Vec<serde_json::Value>> {
    sqlx::query("SELECT id, name, sequence_id, created_at_ms FROM Constructs")
        .fetch_all(pool)
        .await
        .map(|rows| {
            rows.into_iter().map(|row| {
                let id: i64 = row.get("id");
                let name: String = row.get("name");
                let sequence_id: i64 = row.get("sequence_id");
                let created_at_ms: i64 = row.get("created_at_ms");
                serde_json::json!({"id": id, "name": name, "sequence_id": sequence_id, "created_at_ms": created_at_ms})
            }).collect()
        })
}

pub async fn db_create_annotation(
    pool: &DbPool,
    construct_part_id: i64,
    name: String,
    feature_type: String,
    start: i64,
    end: i64,
    strand: i64,
    color: Option<String>,
) -> sqlx::Result<i64> {
    let now_ms = Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO Construct_Annotations (construct_part_id, name, feature_type, start, end, strand, color, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(construct_part_id)
        .bind(&name)
        .bind(&feature_type)
        .bind(start)
        .bind(end)
        .bind(strand)
        .bind(&color)
        .bind(now_ms)
        .execute(pool)
        .await
        .map(|r| r.last_insert_rowid())
}

pub async fn db_list_annotations(
    pool: &DbPool,
    construct_part_id: i64,
) -> sqlx::Result<Vec<serde_json::Value>> {
    sqlx::query("SELECT id, construct_part_id, name, feature_type, start, end, strand, color, created_at_ms FROM Construct_Annotations WHERE construct_part_id = ?")
        .bind(construct_part_id)
        .fetch_all(pool)
        .await
        .map(|rows| {
            rows.into_iter().map(|row| {
                serde_json::json!({
                    "id": row.get::<i64, _>("id"),
                    "construct_part_id": row.get::<i64, _>("construct_part_id"),
                    "name": row.get::<String, _>("name"),
                    "feature_type": row.get::<String, _>("feature_type"),
                    "start": row.get::<i64, _>("start"),
                    "end": row.get::<i64, _>("end"),
                    "strand": row.get::<i64, _>("strand"),
                    "color": row.get::<Option<String>, _>("color"),
                    "created_at_ms": row.get::<i64, _>("created_at_ms"),
                })
            }).collect()
        })
}

pub async fn db_open_construct(pool: &DbPool, construct_id: i64) -> anyhow::Result<serde_json::Value> {
    let row = sqlx::query("SELECT name, sequence_id, created_at_ms FROM Constructs WHERE id = ?")
        .bind(construct_id)
        .fetch_optional(pool)
        .await?;

    let (name, sequence_id, created_at_ms) = row.map(|r| {
        (
            r.get::<String, _>("name"),
            r.get::<i64, _>("sequence_id"),
            r.get::<i64, _>("created_at_ms"),
        )
    }).unwrap_or(("unnamed".into(), 0, 0));

    let parts = sqlx::query(r#"SELECT part_id, start, end, strand, color, "order" FROM Construct_Parts WHERE construct_id = ? ORDER BY "order""#)
        .bind(construct_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "part_id": row.get::<String, _>("part_id"),
                "start": row.get::<i64, _>("start"),
                "end": row.get::<i64, _>("end"),
                "strand": row.get::<i64, _>("strand"),
                "color": row.get::<Option<String>, _>("color"),
                "order": row.get::<i64, _>("order"),
            })
        })
        .collect::<Vec<serde_json::Value>>();

    Ok(serde_json::json!({
        "id": construct_id,
        "name": name,
        "sequence_id": sequence_id,
        "created_at_ms": created_at_ms,
        "parts": parts,
    }))
}

#[tauri::command]
async fn create_construct(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence_id: i64,
) -> Result<i64, SidecarError> {
    db_create_construct(&*state, name, sequence_id)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn add_part_to_construct(
    state: tauri::State<'_, DbPool>,
    construct_id: i64,
    part_id: String,
    start: i64,
    end: i64,
    strand: i64,
    color: Option<String>,
    order: i64,
) -> Result<i64, SidecarError> {
    db_add_part_to_construct(&*state, construct_id, part_id, start, end, strand, color, order)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn save_construct(
    pool: tauri::State<'_, DbPool>,
    construct_id: i64,
    target_path: String,
) -> Result<String, SidecarError> {
    db_save_construct(&*pool, construct_id, target_path)
        .await
        .map_err(|e| SidecarError { error: "IO_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn list_constructs(
    state: tauri::State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, SidecarError> {
    db_list_constructs(&*state)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn open_construct(
    state: tauri::State<'_, DbPool>,
    construct_id: i64,
) -> Result<serde_json::Value, SidecarError> {
    db_open_construct(&*state, construct_id)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn create_annotation(
    state: tauri::State<'_, DbPool>,
    construct_part_id: i64,
    name: String,
    feature_type: String,
    start: i64,
    end: i64,
    strand: i64,
    color: Option<String>,
) -> Result<i64, SidecarError> {
    db_create_annotation(&*state, construct_part_id, name, feature_type, start, end, strand, color)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn list_annotations(
    state: tauri::State<'_, DbPool>,
    construct_part_id: i64,
) -> Result<Vec<serde_json::Value>, SidecarError> {
    db_list_annotations(&*state, construct_part_id)
        .await
        .map_err(|e| SidecarError { error: "DB_ERROR".into(), message: e.to_string() })
}

#[tauri::command]
async fn undo(
    state: tauri::State<'_, Mutex<UndoManager>>,
    sequence_id: i64,
) -> Result<Option<UndoEntry>, SidecarError> {
    let mut manager = state.lock().map_err(|e| SidecarError { error: "LOCK_ERROR".into(), message: e.to_string() })?;
    Ok(manager.undo(sequence_id))
}

#[tauri::command]
async fn redo(
    state: tauri::State<'_, Mutex<UndoManager>>,
    sequence_id: i64,
) -> Result<Option<UndoEntry>, SidecarError> {
    let mut manager = state.lock().map_err(|e| SidecarError { error: "LOCK_ERROR".into(), message: e.to_string() })?;
    Ok(manager.redo(sequence_id))
}
