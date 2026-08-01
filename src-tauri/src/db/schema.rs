// src-tauri/src/db/schema.rs
use sqlx::SqliteConnection;

pub const CREATE_SEQUENCES: &str = r#"
CREATE TABLE IF NOT EXISTS Sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sequence TEXT NOT NULL,
    topology TEXT NOT NULL CHECK(topology IN ('circular','linear')),
    length_bp INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_ANNOTATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS Annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER REFERENCES Sequences(id),
    name TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    strand INTEGER NOT NULL CHECK(strand IN (-1,1)),
    color TEXT,
    notes TEXT,
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_PARTS_LIBRARY: &str = r#"
CREATE TABLE IF NOT EXISTS Parts_Library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sequence TEXT NOT NULL,
    length_bp INTEGER NOT NULL,
    source TEXT,
    notes TEXT,
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_ASSEMBLY_HISTORY: &str = r#"
CREATE TABLE IF NOT EXISTS Assembly_History (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('digest','ligate','import','export','mutate','annotate')),
    parent_sequence_id INTEGER REFERENCES Sequences(id),
    child_sequence_id INTEGER REFERENCES Sequences(id),
    performed_by TEXT NOT NULL CHECK(performed_by IN ('user','agent_developer','agent_tester')),
    parameters_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_TRIGGER_ASSEMBLY_HISTORY_UPDATE: &str = r#"
CREATE TRIGGER IF NOT EXISTS prevent_assembly_history_update
BEFORE UPDATE ON Assembly_History
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Assembly_History is immutable');
END;
"#;

pub const CREATE_ASSEMBLY_HISTORY_DELETE: &str = r#"
CREATE TRIGGER IF NOT EXISTS prevent_assembly_history_delete
BEFORE DELETE ON Assembly_History
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Assembly_History is immutable');
END;
"#;

pub const CREATE_CONSTRUCTS: &str = r#"
CREATE TABLE IF NOT EXISTS Constructs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sequence_id INTEGER REFERENCES Sequences(id),
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_CONSTRUCT_PARTS: &str = r#"
CREATE TABLE IF NOT EXISTS Construct_Parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    construct_id INTEGER REFERENCES Constructs(id),
    part_id TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    strand INTEGER NOT NULL CHECK(strand IN (-1,1)),
    color TEXT,
    "order" INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL
);
"#;

pub const CREATE_CONSTRUCT_ANNOTATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS Construct_Annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    construct_part_id INTEGER NOT NULL REFERENCES Construct_Parts(id),
    name TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    strand INTEGER NOT NULL CHECK(strand IN (-1,1)),
    color TEXT,
    created_at_ms INTEGER NOT NULL
);
"#;

/// Apply the full SQLite schema (tables + immutability triggers).
pub async fn run_schema(conn: &mut SqliteConnection) -> sqlx::Result<()> {
    sqlx::query(CREATE_SEQUENCES)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_ANNOTATIONS)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_PARTS_LIBRARY)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_ASSEMBLY_HISTORY)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_TRIGGER_ASSEMBLY_HISTORY_UPDATE)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_ASSEMBLY_HISTORY_DELETE)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_CONSTRUCTS)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_CONSTRUCT_PARTS)
        .execute(&mut *conn)
        .await?;
    sqlx::query(CREATE_CONSTRUCT_ANNOTATIONS)
        .execute(&mut *conn)
        .await?;
    Ok(())
}
