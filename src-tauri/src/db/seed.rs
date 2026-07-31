// src-tauri/src/db/seed.rs
use std::path::Path;

use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, Row};

use crate::db::models::Part;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SeedPart {
    id: String,
    name: String,
    category: String,
    sequence: String,
    length_bp: usize,
    source: Option<String>,
    notes: Option<String>,
}

/// Load default parts from `test_data/default_parts_seed.json`.
pub async fn load_default_parts<P: AsRef<Path>>(path: P) -> anyhow::Result<Vec<Part>> {
    let data = std::fs::read_to_string(path)?;
    let seeds: Vec<SeedPart> = serde_json::from_str(&data)?;
    let now_ms = now_ms();
    let parts: Vec<Part> = seeds
        .into_iter()
        .map(|s| Part {
            id: s.id,
            name: s.name,
            category: s.category,
            sequence: s.sequence,
            length_bp: s.length_bp as i64,
            source: s.source,
            notes: s.notes,
            created_at_ms: now_ms,
        })
        .collect();
    Ok(parts)
}

/// Insert parts into `Parts_Library` only if the table is empty.
pub async fn seed_if_empty(conn: &mut SqliteConnection, parts: &[Part]) -> anyhow::Result<u64> {
    let row = sqlx::query("SELECT COUNT(*) AS count FROM Parts_Library")
        .fetch_one(&mut *conn)
        .await?;
    let count: i64 = row.try_get("count")?;
    if count > 0 {
        return Ok(0);
    }

    let mut inserted = 0;
    for part in parts {
        sqlx::query(
            "INSERT INTO Parts_Library (id, name, category, sequence, length_bp, source, notes, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&part.id)
        .bind(&part.name)
        .bind(&part.category)
        .bind(&part.sequence)
        .bind(part.length_bp)
        .bind(&part.source)
        .bind(&part.notes)
        .bind(part.created_at_ms)
        .execute(&mut *conn)
        .await?;
        inserted += 1;
    }

    Ok(inserted)
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before UNIX_EPOCH");
    duration.as_millis() as i64
}
