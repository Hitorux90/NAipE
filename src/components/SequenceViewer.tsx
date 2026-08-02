// src/components/SequenceViewer.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getIcon } from '../utils/icons';
import { Dna, FileText, BookOpen } from 'lucide-react';

type Sequence = { id: string; name: string; sequence: string; length_bp: number; topology: string };
interface Props {
  sequence: Sequence | null;
  onChange: (updated: Sequence) => void;
  onCreateSequence?: (created: Sequence) => void;
}

function statusVariant(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('fail') || lower.includes('required')) return ' status--error';
  return ' status--success';
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

  async function saveDna() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      /* TODO: use Tauri dialog.save() API — needs @tauri-apps/plugin-dialog */
      const fallback = `${encodeURIComponent(current.name)}.dna`;
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
      /* TODO: use Tauri dialog.save() API — needs @tauri-apps/plugin-dialog */
      const fallback = `${encodeURIComponent(current.name)}.fasta`;
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
      /* TODO: use Tauri dialog.save() API — needs @tauri-apps/plugin-dialog */
      const fallback = `${encodeURIComponent(current.name)}.gb`;
      const out = await invoke<string>('save_as_gb', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  if (!sequence) {
    return (
      <div className="canvas__empty">
        <h3 className="canvas__title">Sequence Viewer</h3>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="MySequence" />
        </div>
        <div className="form-group">
          <label className="form-label">Topology</label>
          <select className="select" value={topology} onChange={(e) => setTopology(e.target.value)}>
            <option value="circular">circular</option>
            <option value="linear">linear</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Sequence</label>
          <textarea className="textarea" value={sequenceText} onChange={(e) => setSequenceText(e.target.value)} rows={12} placeholder="Paste DNA sequence here..." />
        </div>
        <hr className="separator" />
        <div className="button-group">
          <button id="new-sequence-btn" className="button button--primary" onClick={createSequence}>New sequence</button>
        </div>
        {status && <p className={`status${statusVariant(status)}`}>{status}</p>}
      </div>
    );
  }

  return (
    <div className="canvas__content">
      <h3 className="canvas__title">Sequence Viewer</h3>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="input" value={sequence.name} onChange={(e) => onChange({ ...sequence, name: e.target.value })} />
      </div>
      <p className="canvas__meta">
        Length: {sequence.length_bp} bp | Topology: {sequence.topology}
      </p>
      <div className="form-group">
        <label className="form-label">Sequence</label>
        <textarea className="textarea" value={sequence.sequence} onChange={(e) => onChange({ ...sequence, sequence: e.target.value, length_bp: e.target.value.length })} rows={12} />
      </div>
      <hr className="separator" />
      <div className="button-group">
        <button id="save-dna-btn" className="button button--secondary" onClick={saveDna}><Dna size={16} /> Save as .dna</button>
        <button id="save-fasta-btn" className="button button--secondary" onClick={saveFasta}><FileText size={16} /> Save as .fasta</button>
        <button id="save-gb-btn" className="button button--secondary" onClick={saveGb}><BookOpen size={16} /> Save as .gb</button>
      </div>
      {status && <p className={`status${statusVariant(status)}`}>{status}</p>}
    </div>
  );
}