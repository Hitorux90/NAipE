// src-tauri/src/db/mod.rs
// Database module root.
// Declares submodules and provides a shared `DbPool` type alias.

pub mod schema;
pub mod models;
pub mod seed;

use sqlx::SqlitePool;

/// Shared pool type alias used across the application.
pub type DbPool = SqlitePool;
