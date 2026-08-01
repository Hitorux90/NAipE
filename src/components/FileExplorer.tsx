// src/components/FileExplorer.tsx
type Sequence = { id: string; name: string; length_bp: number; topology: string };

interface Props {
  sequences: Sequence[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSelected: () => void;
}

export default function FileExplorer({ sequences, selectedId, onSelect, onOpenSelected }: Props) {
  const hasSelection = selectedId !== null;
  return (
    <div className="panel">
      <h3>File Explorer</h3>
      <ul>
        {sequences.map((s) => (
          <li
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{ cursor: 'pointer', fontWeight: s.id === selectedId ? 'bold' : 'normal' }}
          >
            {s.name} ({s.topology}, {s.length_bp} bp)
          </li>
        ))}
      </ul>
      <button id="open-file-btn" onClick={onOpenSelected}>
        Open file...
      </button>
      <p style={{ fontSize: '0.85em', color: 'gray' }}>Supported: .dna, .fasta, .gb</p>
    </div>
  );
}
