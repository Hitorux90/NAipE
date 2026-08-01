// src/components/SequenceViewer.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Sequence = { id: string; name: string; sequence: string; length_bp: number; topology: string };
interface Props {
  sequence: Sequence | null;
  onChange: (updated: Sequence) => void;
  onCreateSequence?: (created: Sequence) => void;
}

export default function SequenceViewer({ sequence, onChange, onCreateSequence }: Props) {
  const [name, setName] = useState('');
  const [sequenceText, setSequenceText] = useState('');
  const [topology, setTopology] = useState<string>('circular');
  const [status, setStatus] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!sequence) return;
    const handler = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        await doUndo();
      }
      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        await doRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sequence]);

  async function doUndo() {
    if (!sequence) return;
    setStatus(null);
    try {
      const res = await invoke<{ old_text: string; new_text: string } | null>('undo', { sequenceId: Number(sequence.id) });
      if (res) {
        onChange({ ...sequence, sequence: res.old_text, length_bp: res.old_text.length });
        setStatus('Undo');
      }
    } catch (e: any) {
      setStatus(`Undo failed: ${e?.message ?? e}`);
    }
  }

  async function doRedo() {
    if (!sequence) return;
    setStatus(null);
    try {
      const res = await invoke<{ old_text: string; new_text: string } | null>('redo', { sequenceId: Number(sequence.id) });
      if (res) {
        onChange({ ...sequence, sequence: res.new_text, length_bp: res.new_text.length });
        setStatus('Redo');
      }
    } catch (e: any) {
      setStatus(`Redo failed: ${e?.message ?? e}`);
    }
  }

  async function createSequence() {
    setStatus(null);
    if (!name.trim() || !sequenceText.trim()) {
      setStatus('Name and sequence are required.');
      return;
    }
    try {
      const result = await invoke<{ id: number; name: string; sequence: string; length_bp: number; topology: string }>('create_sequence', {
        name,
        sequence: sequenceText,
        topology,
      });
      setStatus('Sequence created');
      setName('');
      setSequenceText('');
      onCreateSequence?.({
        id: String(result.id),
        name: result.name,
        sequence: result.sequence,
        length_bp: result.length_bp,
        topology: result.topology,
      });
    } catch (e: any) {
      setStatus(`Create failed: ${e?.message ?? e}`);
    }
  }

  if (!sequence) {
    return (
      <div className="panel">
        <div className="panel__header">
          <h3 className="panel__title">Sequence Viewer</h3>
        </div>
        <label>
          Name:{' '}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="MySequence" />
        </label>
        <br />
        <label>
          Topology:{' '}
          <select className="select" value={topology} onChange={(e) => setTopology(e.target.value)}>
            <option value="circular">circular</option>
            <option value="linear">linear</option>
          </select>
        </label>
        <br />
        <textarea className="textarea" value={sequenceText} onChange={(e) => setSequenceText(e.target.value)} rows={12} placeholder="Paste DNA sequence here..." />
        <br />
        <button id="new-sequence-btn" className="button button--primary" onClick={createSequence}>New sequence</button>
        {status && <p>{status}</p>}
      </div>
    );
  }

  async function saveDna() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      
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

  async function saveFasta() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      
      const fallback = `C:\\ApE\\src-tauri\\target\\debug\\${encodeURIComponent(current.name)}.fasta`;
      const out = await invoke<string>('save_as_fasta', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  async function saveGb() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      
      const fallback = `C:\\ApE\\src-tauri\\target\\debug\\${encodeURIComponent(current.name)}.gb`;
      const out = await invoke<string>('save_as_gb', {
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
      <div className="panel__header">
        <h3 className="panel__title">Sequence Viewer</h3>
      </div>
      <label>
        Name:{' '}
        <input className="input" value={sequence.name} onChange={(e) => onChange({ ...sequence, name: e.target.value })} />
      </label>
      <br />
      Length: {sequence.length_bp} bp | Topology: {sequence.topology}
      <br />
      <textarea className="textarea" value={sequence.sequence} onChange={(e) => onChange({ ...sequence, sequence: e.target.value, length_bp: e.target.value.length })} rows={12} />
      <br />
      <button id="undo-btn" className="button button--secondary" onClick={doUndo} disabled={!canUndo}>Undo</button>
      <button id="redo-btn" className="button button--secondary" onClick={doRedo} disabled={!canRedo}>Redo</button>
      <button id="save-dna-btn" className="button button--secondary" onClick={saveDna}>Save as .dna</button>
      <button id="save-fasta-btn" className="button button--secondary" onClick={saveFasta}>Save as .fasta</button>
      <button id="save-gb-btn" className="button button--secondary" onClick={saveGb}>Save as .gb</button>
      {status && <p>{status}</p>}
    </div>
  );
}
