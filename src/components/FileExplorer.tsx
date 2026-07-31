// src/components/FileExplorer.tsx
type Sequence = { id: string; name: string };
interface Props {
  sequences: Sequence[];
  onSelect: (id: string) => void;
}

export default function FileExplorer({ sequences, onSelect }: Props) {
  return (
    <div className="panel">
      <h3>File Explorer</h3>
      <ul>
        {sequences.map((s) => (
          <li key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
