use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// NDJSON wire envelope (flat shape, per ndjson_examples.md)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarRequest {
    #[serde(rename = "id")]
    pub request_id: String,
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub command: String,
    pub payload: serde_json::Value,
    #[serde(rename = "timestamp_ms")]
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarResponse {
    #[serde(rename = "request_id")]
    pub request_id: String,
    pub ok: bool,
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarErrorEnvelope {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Sequence / annotation model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceState {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub topology: Topology,
    pub annotations: Vec<Annotation>,
    pub length_bp: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Topology {
    Circular,
    Linear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    pub start: usize,
    pub end: usize,
    pub strand: Strand,
    pub color: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Strand {
    Positive,
    Negative,
    Both,
}

// ---------------------------------------------------------------------------
// Parts & commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Part {
    pub id: String,
    pub name: String,
    pub role: String,
    pub sequence: String,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Command {
    Insert { target_id: String, at: usize, inserted: Vec<Part> },
    Delete { target_id: String, from: usize, to: usize },
    Replace { target_id: String, from: usize, to: usize, replacement: Vec<Part> },
    AnnotationMove { annotation_id: String, new_start: usize, new_end: usize },
}

// ---------------------------------------------------------------------------
// Persistence / DB types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSequence {
    pub id: String,
    pub name: String,
    pub sequence: String,
    pub topology: String,
    pub length_bp: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbAnnotation {
    pub id: String,
    pub sequence_id: String,
    pub name: String,
    pub annotation_type: String,
    pub start: usize,
    pub end: usize,
    pub strand: String,
    pub color: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbPart {
    pub id: String,
    pub annotation_id: Option<String>,
    pub role: String,
    pub sequence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbAssemblyHistoryRow {
    pub id: String,
    pub sequence_id: String,
    pub command_json: String,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Feature / tool contracts
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigestRequest {
    pub id: String,
    pub sequence: String,
    pub enzymes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigestResponse {
    pub request_id: String,
    pub cuts: Vec<DigestCut>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigestCut {
    pub enzyme: String,
    pub site: String,
    pub position: usize,
    pub fragment_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoAnnotateRequest {
    pub id: String,
    pub sequence: String,
    pub hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoAnnotateResponse {
    pub request_id: String,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseRequest {
    pub id: String,
    pub content: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResponse {
    pub request_id: String,
    pub sequence: SequenceState,
}
