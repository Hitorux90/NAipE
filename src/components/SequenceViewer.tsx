// src/components/SequenceViewer.tsx
import { useState } from 'react';

type Sequence = { id: string; name: string; sequence: string; length_bp: number; topology: string };
interface Props {
  sequence: Sequence | null;
  onChange: (updated: Sequence) => void;
}

export default function SequenceViewer({ sequence, onChange }: Props) {
  const [name, setName] = useState('');
  const [sequenceText, setSequenceText] = useState('');
  const [topology, setTopology] = useState<string>('circular');
  const [status, setStatus] = useState<string | null>(null);

  if (!sequence) {
    return (
      <div className="panel">
        <h3>Sequence Viewer</h3>
        <label>
          Name:{' '}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MySequence"
          />
        </label>
        <br />
        <label>
          Topology:{' '}
          <select value={topology} onChange={(e) => setTopology(e.target.value)}>
            <option value="circular">circular</option>
            <option value="linear">linear</option>
          </select>
        </label>
        <br />
        <textarea
          value={sequenceText}
          onChange={(e) => setSequenceText(e.target.value)}
          rows={12}
          placeholder="Paste DNA sequence here..."
          style={{ width: '100%' }}
        />
        <br />
        <button id="new-sequence-btn">New sequence</button>
      </div>
    );
  }

  async function saveDna() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const fallback = `C:\\ApE\\src-tauri\\target\\debug\\${encodeURIComponent(current.name)}.dna`;
      const out = await invoke<string>('save_dna', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="panel">
      <h3>Sequence Viewer</h3>
      <label>
        Name:{' '}
        <input
          value={sequence.name}
          onChange={(e) => onChange({ ...sequence, name: e.target.value })}
        />
      </label>
      <br />
      Length: {sequence.length_bp} bp | Topology: {sequence.topology}
      <br />
      <textarea
        value={sequence.sequence}
        onChange={(e) => onChange({ ...sequence, sequence: e.target.value, length_bp: e.target.value.length })}
        rows={12}
        style={{ width: '100%' }}
      />
      <br />
      <button id="save-dna-btn" onClick={saveDna}>Save as .dna</button>
      {status && <p>{status}</p>}
    </div>
  );
}
