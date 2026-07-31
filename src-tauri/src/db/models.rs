// src-tauri/src/db/models.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ---------------------------------------------------------------------------
// Database row models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sequence {
    pub id: i64,
    pub name: String,
    pub sequence: String,
    pub topology: String,
    pub length_bp: i64,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Annotation {
    pub id: i64,
    pub sequence_id: Option<i64>,
    pub name: String,
    pub feature_type: String,
    pub start: i64,
    pub end: i64,
    pub strand: i64,
    pub color: Option<String>,
    pub notes: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Part {
    pub id: String,
    pub name: String,
    pub category: String,
    pub sequence: String,
    pub length_bp: i64,
    pub source: Option<String>,
    pub notes: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AssemblyHistoryRecord {
    pub id: i64,
    pub operation_type: String,
    pub parent_sequence_id: Option<i64>,
    pub child_sequence_id: Option<i64>,
    pub performed_by: String,
    pub parameters_json: String,
    pub created_at_ms: i64,
}

// ---------------------------------------------------------------------------
// CRUD query stubs
// ---------------------------------------------------------------------------

pub struct SequenceQueries;
impl SequenceQueries {
    pub const BY_ID: &'static str = "SELECT id, name, sequence, topology, length_bp, created_at_ms FROM Sequences WHERE id = ?";
    pub const ALL: &'static str = "SELECT id, name, sequence, topology, length_bp, created_at_ms FROM Sequences ORDER BY created_at_ms DESC";
    pub const INSERT: &'static str = "INSERT INTO Sequences (name, sequence, topology, length_bp, created_at_ms) VALUES (?, ?, ?, ?, ?) RETURNING id, name, sequence, topology, length_bp, created_at_ms";
    pub const UPDATE_BY_ID: &'static str = "UPDATE Sequences SET name = ?, sequence = ?, topology = ?, length_bp = ? WHERE id = ?";
    pub const DELETE_BY_ID: &'static str = "DELETE FROM Sequences WHERE id = ?";
}

pub struct AnnotationQueries;
impl AnnotationQueries {
    pub const BY_ID: &'static str = "SELECT id, sequence_id, name, feature_type, start, end, strand, color, notes, created_at_ms FROM Annotations WHERE id = ?";
    pub const BY_SEQUENCE_ID: &'static str = "SELECT id, sequence_id, name, feature_type, start, end, strand, color, notes, created_at_ms FROM Annotations WHERE sequence_id = ? ORDER BY start ASC";
    pub const INSERT: &'static str = "INSERT INTO Annotations (sequence_id, name, feature_type, start, end, strand, color, notes, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, sequence_id, name, feature_type, start, end, strand, color, notes, created_at_ms";
    pub const UPDATE_BY_ID: &'static str = "UPDATE Annotations SET sequence_id = ?, name = ?, feature_type = ?, start = ?, end = ?, strand = ?, color = ?, notes = ? WHERE id = ?";
    pub const DELETE_BY_ID: &'static str = "DELETE FROM Annotations WHERE id = ?";
}

pub struct PartQueries;
impl PartQueries {
    pub const BY_ID: &'static str = "SELECT id, name, category, sequence, length_bp, source, notes, created_at_ms FROM Parts_Library WHERE id = ?";
    pub const ALL: &'static str = "SELECT id, name, category, sequence, length_bp, source, notes, created_at_ms FROM Parts_Library ORDER BY name ASC";
    pub const INSERT: &'static str = "INSERT INTO Parts_Library (id, name, category, sequence, length_bp, source, notes, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, name, category, sequence, length_bp, source, notes, created_at_ms";
    pub const UPDATE_BY_ID: &'static str = "UPDATE Parts_Library SET name = ?, category = ?, sequence = ?, length_bp = ?, source = ?, notes = ? WHERE id = ?";
    pub const DELETE_BY_ID: &'static str = "DELETE FROM Parts_Library WHERE id = ?";
}

pub struct AssemblyHistoryQueries;
impl AssemblyHistoryQueries {
    pub const BY_ID: &'static str = "SELECT id, operation_type, parent_sequence_id, child_sequence_id, performed_by, parameters_json, created_at_ms FROM Assembly_History WHERE id = ?";
    pub const BY_PARENT_SEQUENCE: &'static str = "SELECT id, operation_type, parent_sequence_id, child_sequence_id, performed_by, parameters_json, created_at_ms FROM Assembly_History WHERE parent_sequence_id = ? ORDER BY created_at_ms ASC";
    pub const INSERT: &'static str = "INSERT INTO Assembly_History (operation_type, parent_sequence_id, child_sequence_id, performed_by, parameters_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, operation_type, parent_sequence_id, child_sequence_id, performed_by, parameters_json, created_at_ms";
}
