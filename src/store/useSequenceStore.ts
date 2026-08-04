import { create } from 'zustand';
import { SequenceState, Annotation, Topology, Strand } from '../src/contracts';

export function normalizeFeatureToAnnotation(f: any, index: number): Annotation {
  let strand: Strand = '+';
  if (f.strand === -1 || f.strand === '-') strand = '-';
  else if (f.strand === 0 || f.strand === 'both') strand = 'both';

  return {
    id: f.id || `ann-${index}-${Date.now()}`,
    name: f.name || f.type || 'unnamed',
    type: f.type || 'misc_feature',
    start: Number(f.start) || 1,
    end: Number(f.end) || 1,
    strand,
    color: f.color || '#888888',
    notes: f.note || f.notes || (f.translation ? `aa:${f.translation.length}` : ''),
  };
}

export function normalizeRawSequence(raw: any): SequenceState {
  const topology: Topology = raw.topology?.toLowerCase() === 'linear' ? 'linear' : 'circular';
  const rawFeatures = raw.features || raw.annotations || [];
  const annotations = rawFeatures.map((f: any, i: number) => normalizeFeatureToAnnotation(f, i));

  return {
    id: String(raw.id),
    name: raw.name || 'Untitled',
    sequence: raw.sequence || '',
    topology,
    annotations,
    length_bp: Number(raw.length_bp) || (raw.sequence ? raw.sequence.length : 0),
  };
}

interface SequenceStore {
  sequences: SequenceState[];
  activeId: string | null;
  theme: 'light' | 'dark';
  
  // Actions
  setActiveId: (id: string | null) => void;
  addSequence: (rawSeq: any) => void;
  updateActiveSequence: (partial: Partial<SequenceState>) => void;
  closeTab: (id: string) => void;
  toggleTheme: () => void;
  
  // Getters
  getActiveSequence: () => SequenceState | null;
}

export const useSequenceStore = create<SequenceStore>((set, get) => ({
  sequences: [],
  activeId: null,
  theme: 'light',

  setActiveId: (id) => set({ activeId: id }),

  closeTab: (id) => {
    set((state) => {
      const remaining = state.sequences.filter((s) => s.id !== id);
      let nextActiveId = state.activeId;
      if (state.activeId === id) {
        nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }
      return {
        sequences: remaining,
        activeId: nextActiveId,
      };
    });
  },

  addSequence: (rawSeq) => {
    const normalized = normalizeRawSequence(rawSeq);
    set((state) => {
      const exists = state.sequences.find((s) => s.id === normalized.id);
      const updatedList = exists
        ? state.sequences.map((s) => (s.id === normalized.id ? normalized : s))
        : [...state.sequences, normalized];
      return {
        sequences: updatedList,
        activeId: normalized.id,
      };
    });
  },

  updateActiveSequence: (partial) => {
    const { activeId, sequences } = get();
    if (!activeId) return;

    set({
      sequences: sequences.map((seq) => {
        if (seq.id === activeId) {
          const updated = { ...seq, ...partial };
          if (partial.sequence !== undefined) {
            updated.length_bp = partial.sequence.length;
          }
          return updated;
        }
        return seq;
      }),
    });
  },

  toggleTheme: () => {
    set((state) => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { theme: nextTheme };
    });
  },

  getActiveSequence: () => {
    const { activeId, sequences } = get();
    return sequences.find((s) => s.id === activeId) || null;
  },
}));
