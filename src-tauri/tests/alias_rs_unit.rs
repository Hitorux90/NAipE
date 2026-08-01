// src-tauri/tests/alias_rs_unit.rs
//! Phase 1 alias regression tests.
//! Ensures deprecated aliases still work against SQLite.

use apetauri_lib::{inner_create_sequence, fetch_sequences};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

async fn setup_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect memory sqlite");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS Sequences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sequence TEXT NOT NULL,
            topology TEXT NOT NULL CHECK(topology IN ('circular','linear')),
            length_bp INTEGER NOT NULL,
            created_at_ms INTEGER NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .expect("create sequences table");

    pool
}

#[tokio::test]
async fn test_new_sequence_alias() {
    let pool = setup_pool().await;
    let seq = inner_create_sequence(&pool, "AliasSeq", "ATGC", "circular")
        .await
        .expect("create_sequence");
    assert_eq!(seq.name, "AliasSeq");
    assert_eq!(seq.sequence, "ATGC");
    assert_eq!(seq.topology, "circular");
}

#[tokio::test]
async fn test_list_after_alias_create() {
    let pool = setup_pool().await;
    inner_create_sequence(&pool, "AliasSeq", "ATGC", "circular")
        .await
        .expect("create_sequence");
    let all = fetch_sequences(&pool).await.expect("fetch");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].name, "AliasSeq");
}
