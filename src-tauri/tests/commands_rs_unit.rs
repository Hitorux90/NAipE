//! Rust unit tests for sequence-level database commands.
//! These tests exercise sequence create/list/save/open helpers
//! against an in-memory SQLite database via sqlx.
//!
//! Note: After Phase 2 audit, format-specific I/O for DNA/FASTA/GenBank
//! was moved from Rust to the Python sidecar. The Rust-side file helpers
//! `load_sequence_from_file` and `save_gb_to_file` were removed.
//! Format round-trip coverage now lives in Python sidecar tests.

use apetauri_lib::{inner_create_sequence, fetch_sequences};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

fn memory_url() -> String {
    "sqlite::memory:".into()
}

async fn pool() -> SqlitePool {
    let url = memory_url();
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect sqlite pool")
}

async fn seed_schema(p: &SqlitePool) {
    sqlx::query(apetauri_lib::db::schema::CREATE_SEQUENCES)
        .execute(p)
        .await
        .expect("create sequences");
    sqlx::query(apetauri_lib::db::schema::CREATE_ANNOTATIONS)
        .execute(p)
        .await
        .expect("create annotations");
    sqlx::query(apetauri_lib::db::schema::CREATE_PARTS_LIBRARY)
        .execute(p)
        .await
        .expect("create parts");
    sqlx::query(apetauri_lib::db::schema::CREATE_ASSEMBLY_HISTORY)
        .execute(p)
        .await
        .expect("create assembly history");
    sqlx::query(apetauri_lib::db::schema::CREATE_TRIGGER_ASSEMBLY_HISTORY_UPDATE)
        .execute(p)
        .await
        .expect("update trigger");
    sqlx::query(apetauri_lib::db::schema::CREATE_ASSEMBLY_HISTORY_DELETE)
        .execute(p)
        .await
        .expect("delete trigger");
}

#[tokio::test]
async fn test_new_sequence_persists() {
    let p = pool().await;
    seed_schema(&p).await;

    let seq = inner_create_sequence(&p, "TestSeq", "ATGC", "circular")
        .await
        .expect("insert sequence");

    assert_eq!(seq.name, "TestSeq");
    assert_eq!(seq.sequence, "ATGC");
    assert_eq!(seq.topology, "circular");
    assert_eq!(seq.length_bp, 4);
}

#[tokio::test]
async fn test_list_sequences_returns_inserted() {
    let p = pool().await;
    seed_schema(&p).await;

    inner_create_sequence(&p, "A", "ATGC", "circular")
        .await
        .unwrap();
    inner_create_sequence(&p, "B", "AAAA", "linear")
        .await
        .unwrap();

    let all = fetch_sequences(&p)
        .await
        .expect("list sequences");

    assert_eq!(all.len(), 2);
}

#[tokio::test]
async fn test_save_dna_writes_json_file() {
    let p = pool().await;
    seed_schema(&p).await;

    let seq = inner_create_sequence(&p, "SaveTest", "ATGC", "circular")
        .await
        .unwrap();

    let tmp = std::env::temp_dir().join(format!("naipesave_{}.dna", seq.id));
    let saved = apetauri_lib::save_dna_to_file(&p, seq.id, &tmp)
        .await
        .expect("save dna");

    assert!(saved.exists());
    let content = std::fs::read_to_string(&saved).expect("read dna");
    assert!(content.contains("SaveTest"));
    assert!(content.contains("ATGC"));
    std::fs::remove_file(&tmp).ok();
}

#[tokio::test]
async fn test_open_fasta_round_trip() {
    let p = pool().await;
    seed_schema(&p).await;

    let seq = inner_create_sequence(&p, "FastaTest", "AAAA", "linear")
        .await
        .unwrap();

    let tmp = std::env::temp_dir().join(format!("naipeopen_{}.fasta", seq.id));
    apetauri_lib::save_fasta_to_file(&p, seq.id, &tmp)
        .await
        .unwrap();

    let content = std::fs::read_to_string(&tmp).expect("read fasta");
    assert!(content.starts_with(">FastaTest"));
    assert!(content.contains("AAAA"));
    std::fs::remove_file(&tmp).ok();
}

#[tokio::test]
async fn test_assembly_schema_constants_exist() {
    use apetauri_lib::db::schema::{CREATE_CONSTRUCTS, CREATE_CONSTRUCT_PARTS};
    assert!(CREATE_CONSTRUCTS.contains("CREATE TABLE IF NOT EXISTS Constructs"));
    assert!(CREATE_CONSTRUCT_PARTS.contains("CREATE TABLE IF NOT EXISTS Construct_Parts"));
}
