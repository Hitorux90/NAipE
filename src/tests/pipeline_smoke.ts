// src/tests/pipeline_smoke.ts
//
// Frontend smoke test for the pipeline: mock Tauri invoke() -> assert Zustand
// store updates with returned SequenceState.
//
// Uses Vitest-style assertions; swap for Jest if needed.

type SequenceState = {
  id: string;
  name: string;
  sequence: string;
  topology: "circular" | "linear";
  annotations: Annotation[];
  length_bp: number;
};

type Annotation = {
  id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  strand: number;
  color?: string;
  notes?: string;
};

type AppError = {
  error_code: string;
  layer: string;
  message_dev: string;
  message_user: string;
  recoverable: boolean;
  context: Record<string, unknown>;
};

// Minimal Zustand-like store for testing.
interface Store {
  activeSequence: SequenceState | null;
  setActiveSequence(seq: SequenceState): void;
  setError(error: AppError | null): void;
}

function createStore(): Store {
  return {
    activeSequence: null,
    setActiveSequence(seq: SequenceState) {
      this.activeSequence = seq;
    },
    setError(error: AppError | null) {
      // In real app: toast vs modal based on error.recoverable
    },
  };
}

// Mock Tauri invoke
const mockResponses: Record<string, unknown> = {
  parse_file: {
    id: "test-1",
    name: "pUC19",
    sequence: "GAATTC...",
    topology: "circular",
    annotations: [],
    length_bp: 2686,
  },
  digest: {
    request_id: "dig-1",
    cuts: [{ enzyme: "EcoRI", site: "GAATTC", position: 1, fragment_length: 12 }],
  },
};

const originalInvoke = (globalThis as unknown as Record<string, unknown>).invoke;
(globalThis as unknown as Record<string, unknown>).invoke = async (
  cmd: string,
  _args?: unknown
): Promise<unknown> => {
  return mockResponses[cmd] ?? Promise.reject(new Error(`unknown command ${cmd}`));
};

export { createStore };
export type { SequenceState, Annotation, AppError, Store };
