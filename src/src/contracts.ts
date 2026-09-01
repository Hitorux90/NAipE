// ===========================================================================
// Shared contract / spec types for NAipE (Sprint 1)
// React + Zustand consumer file — no app-level imports.
// ===========================================================================

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export interface AppError {
  error_code: ErrorCode;
  layer: 'Sidecar' | 'Core' | 'UI';
  message_dev: string;
  message_user: string;
  recoverable: boolean;
  context: Record<string, unknown>;
}

export interface SidecarResponse {
  request_id: string;
  ok: boolean;
  result: unknown;
}

export interface SidecarErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const enum ErrorCode {
  SIDECAR_TIMEOUT = 'SIDECAR_TIMEOUT',
  SIDECAR_CRASH = 'SIDECAR_CRASH',
  PARSE_INVALID_APE = 'PARSE_INVALID_APE',
  PARSE_INVALID_GENBANK = 'PARSE_INVALID_GENBANK',
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
  SEED_MISSING = 'SEED_MISSING',
  SEQUENCE_TOO_LARGE = 'SEQUENCE_TOO_LARGE',
}

// ---------------------------------------------------------------------------
// Sequence / annotation model
// ---------------------------------------------------------------------------

export type Topology = 'circular' | 'linear';
export type Strand = '+' | '-' | 'both';

export interface Annotation {
  id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  strand: Strand;
  color: string;
  notes: string;
}

export interface SequenceState {
  id: string;
  name: string;
  sequence: string;
  topology: Topology;
  annotations: Annotation[];
  length_bp: number;
}

// ---------------------------------------------------------------------------
// Parts & commands
// ---------------------------------------------------------------------------

export interface Part {
  id: string;
  name: string;
  role: string;
  sequence: string;
  annotations: Annotation[];
}

export type Command =
  | { op: 'insert'; target_id: string; at: number; inserted: Part[] }
  | { op: 'delete'; target_id: string; from: number; to: number }
  | { op: 'replace'; target_id: string; from: number; to: number; replacement: Part[] }
  | { op: 'annotation_move'; annotation_id: string; new_start: number; new_end: number };

// ---------------------------------------------------------------------------
// Persistence / DB types
// ---------------------------------------------------------------------------

export interface DbSequence {
  id: string;
  name: string;
  sequence: string;
  topology: string;
  length_bp: number;
}

export interface DbAnnotation {
  id: string;
  sequence_id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  strand: string;
  color: string;
  notes: string;
}

export interface DbPart {
  id: string;
  annotation_id: string | null;
  role: string;
  sequence: string;
}

export interface DbAssemblyHistoryRow {
  id: string;
  sequence_id: string;
  command_json: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Feature / tool contracts
// ---------------------------------------------------------------------------

export interface DigestRequest {
  id: string;
  sequence: string;
  enzymes: string[];
}

export interface DigestCut {
  enzyme: string;
  site: string;
  position: number;
  fragment_length: number;
}

export interface DigestResponse {
  request_id: string;
  cuts: DigestCut[];
}

export interface AutoAnnotateRequest {
  id: string;
  sequence: string;
  hints: string[];
}

export interface AutoAnnotateResponse {
  request_id: string;
  annotations: Annotation[];
}

export interface ParseRequest {
  id: string;
  content: string;
  format: string;
}

export interface ParseResponse {
  request_id: string;
  sequence: SequenceState;
}
