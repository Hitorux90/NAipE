import { getIcon } from '../utils/icons';

type Sequence = { id: string; name: string; length_bp: number; topology: string };

interface Props {
  sequences: Sequence[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSelected: () => void;
}

export default function FileExplorer({ sequences, selectedId, onSelect, onOpenSelected }: Props) {
  const FileIcon = getIcon('folder-open');

  return (
    <div className="panel">
      <div className="panel__header">
        <FileIcon size={16} />
        <h3 className="panel__title">File Explorer</h3>
      </div>
      <ul className="file-list">
        {sequences.map((s) => (
          <li
            key={s.id}
            className={`file-item${selectedId === s.id ? ' file-item--active' : ''}`}
            onClick={() => onSelect(s.id)}
            role="button"
            tabIndex={0}
          >
            <span className="file-item__name">{s.name}</span>
            <span className="file-item__meta">{s.topology}, {s.length_bp} bp</span>
          </li>
        ))}
      </ul>
      <div className="file-explorer__actions">
        <button className="button button--primary" onClick={onOpenSelected} id="open-file-btn">
          Open file...
        </button>
        <p className="file-explorer__hint">Supported: .dna, .fasta, .gb</p>
      </div>
    </div>
  );
}
