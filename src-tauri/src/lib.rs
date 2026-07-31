// src-tauri/src/lib.rs
// Library root for the Tauri application.
// Declares modules, defines the Tauri builder, and exports `run()`.

#![allow(dead_code)]

pub mod db;
pub mod sidecar;

use db::schema::run_schema;
use db::seed::{load_default_parts, seed_if_empty};
use db::DbPool;
use db::models::{Part, Sequence};
use sidecar::{SidecarConfig, SidecarManager};
use std::path::PathBuf;
use tauri::Manager;
use chrono::Utc;

pub async fn create_sequence(
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

    let dna = serde_json::json!({
        "version": "0.1",
        "format": "NAipE-dna",
        "name": seq.name,
        "sequence": seq.sequence,
        "length_bp": seq.length_bp,
        "topology": seq.topology,
        "created_at_ms": seq.created_at_ms,
        "parts": []
    });

    let text = serde_json::to_string_pretty(&dna)?;
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

pub async fn load_sequence_from_file(
    path: &std::path::Path,
) -> anyhow::Result<Sequence> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let raw = std::fs::read_to_string(path)?;

    match ext.as_str() {
        "dna" => {
            let v: serde_json::Value = serde_json::from_str(&raw)?;
            Ok(Sequence {
                id: 0,
                name: v["name"].as_str().unwrap_or("unnamed").to_string(),
                sequence: v["sequence"].as_str().unwrap_or_default().to_string(),
                topology: v["topology"].as_str().unwrap_or("circular").to_string(),
                length_bp: v["length_bp"].as_i64().unwrap_or_default(),
                created_at_ms: v["created_at_ms"].as_i64().unwrap_or_default(),
            })
        }
        "fasta" => {
            let mut lines = raw.lines();
            let header = lines.next().unwrap_or_default();
            let name = header.trim_start_matches('>').split_whitespace().next().unwrap_or("unnamed").to_string();
            let seq = lines.collect::<Vec<_>>().join("");
            let topology = if header.contains("topology=circular") { "circular" } else { "linear" };
            let length_bp = seq.len() as i64;
            Ok(Sequence {
                id: 0,
                name,
                sequence: seq,
                topology: topology.to_string(),
                length_bp,
                created_at_ms: 0,
            })
        }
        _ => anyhow::bail!("unsupported extension: {}", ext),
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

                match sidecar_result {
                    Ok(manager) => {
                        app.manage(pool);
                        app.manage(manager);
                    }
                    Err(err) => {
                        eprintln!("[ApE] failed to start sidecar: {err}");
                        app.manage(pool);
                    }
                }

                Ok(())
            })
        })
        .invoke_handler(tauri::generate_handler![greet, get_parts, new_sequence, list_sequences, save_dna, save_fasta, open_file])
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
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn new_sequence(
    state: tauri::State<'_, DbPool>,
    name: String,
    sequence: String,
    topology: String,
) -> Result<Sequence, String> {
    let now_ms = Utc::now().timestamp_millis();
    let length_bp = sequence.len() as i64;

    let row = sqlx::query_as::<_, Sequence>(
        db::models::SequenceQueries::INSERT,
    )
    .bind(&name)
    .bind(&sequence)
    .bind(&topology)
    .bind(length_bp)
    .bind(now_ms)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
async fn list_sequences(state: tauri::State<'_, DbPool>) -> Result<Vec<Sequence>, String> {
    sqlx::query_as::<_, Sequence>(db::models::SequenceQueries::ALL)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_dna(
    state: tauri::State<'_, DbPool>,
    sequence_id: i64,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    save_dna_to_file(&*state, sequence_id, path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
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
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_file(
    state: tauri::State<'_, DbPool>,
    target_path: String,
) -> Result<Sequence, String> {
    use std::path::Path;
    let path = Path::new(&target_path);
    let mut seq = load_sequence_from_file(path).await.map_err(|e| e.to_string())?;
    if seq.id == 0 {
        seq = create_sequence(&*state, &seq.name, &seq.sequence, &seq.topology)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(seq)
}
