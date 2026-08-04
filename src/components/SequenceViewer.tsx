// src/components/SequenceViewer.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dna, FileText, BookOpen, Circle, AlignLeft } from 'lucide-react';
import { SequenceState } from '../src/contracts';
export type Sequence = SequenceState; // convenience re-export
import CircularViewer from './CircularViewer';
import LinearViewer from './LinearViewer';
import ViewTabs from './ViewTabs';

import RestrictionMapper from './RestrictionMapper';
import PrimerDesigner from './PrimerDesigner';
import OrfFinder from './OrfFinder';
import SequenceAligner from './SequenceAligner';
import VirtualCloning from './VirtualCloning';
import BiochemicalPlots from './BiochemicalPlots';
import AutoAnnotator from './AutoAnnotator';
import MotifSearch from './MotifSearch';

function formatSequence(seq: string): string {
  const BLOCK = 10;
  const BLOCKS_PER_LINE = 6;   // 60 bp per line — standard GenBank ORIGIN format
  const LINE_BP = BLOCK * BLOCKS_PER_LINE;
  const lines: string[] = [];
  for (let i = 0; i < seq.length; i += LINE_BP) {
    const lineNum = String(i + 1).padStart(9, ' ');
    const chunk = seq.slice(i, i + LINE_BP);
    const blocks: string[] = [];
    for (let j = 0; j < chunk.length; j += BLOCK) {
      blocks.push(chunk.slice(j, j + BLOCK).toLowerCase());
    }
    lines.push(`${lineNum} ${blocks.join(' ')}`);
  }
  return lines.join('\n');
}

interface Props {
  sequence: SequenceState | null;
  onChange: (updated: SequenceState) => void;
  onCreateSequence?: (created: any) => void;
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
  const [viewMode, setViewMode] = useState<'text' | 'circular' | 'linear' | 'restriction' | 'primer' | 'orf' | 'align' | 'clone' | 'plots' | 'auto_annotate' | 'motif'>('text');

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
      <div className="canvas__header">
        <h3 className="canvas__title">Sequence Viewer</h3>
        <ViewTabs
          tabs={[
            { id: 'text', label: 'Sequence' },
            { id: 'circular', label: 'Circular Map' },
            { id: 'linear', label: 'Linear Map' },
            { id: 'restriction', label: 'Restriction Map' },
            { id: 'primer', label: 'Primer / PCR' },
            { id: 'orf', label: 'ORF Finder' },
            { id: 'align', label: 'Sequence Aligner' },
            { id: 'clone', label: 'Virtual Cloning' },
            { id: 'plots', label: 'Biochemical Plots' },
            { id: 'auto_annotate', label: 'Auto-Annotation' },
            { id: 'motif', label: 'Motif Search' },
          ]}
          active={viewMode}
          onChange={(id) => setViewMode(id as any)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="input" value={sequence.name} onChange={(e) => onChange({ ...sequence, name: e.target.value })} />
      </div>
      <p className="canvas__meta">
        Length: {sequence.length_bp} bp | Topology: {sequence.topology}
      </p>

      {/* Render View based on active mode */}
      {viewMode === 'circular' && <CircularViewer sequence={sequence} />}
      {viewMode === 'linear' && <LinearViewer sequence={sequence} />}
      {viewMode === 'restriction' && <RestrictionMapper sequence={sequence} />}
      {viewMode === 'primer' && <PrimerDesigner sequence={sequence} />}
      {viewMode === 'orf' && <OrfFinder sequence={sequence} />}
      {viewMode === 'align' && <SequenceAligner sequence={sequence} />}
      {viewMode === 'clone' && <VirtualCloning sequence={sequence} />}
      {viewMode === 'plots' && <BiochemicalPlots sequence={sequence} />}
      {viewMode === 'auto_annotate' && <AutoAnnotator sequence={sequence} onChange={onChange} />}
      {viewMode === 'motif' && <MotifSearch sequence={sequence} onChange={onChange} />}

      {viewMode === 'text' && (
        <>
          {sequence.annotations && sequence.annotations.length > 0 && (
            <div className="feature-list">
              <h4 className="feature-list__title">Features ({sequence.annotations.length})</h4>
              {sequence.annotations.map((f) => {
                const tileStyle = { borderLeftColor: f.color || '#888888' };
                return (
                  <div key={f.id} className="feature-tile" style={tileStyle}>
                    <span className="feature-tile__name">{f.name || f.type || 'unnamed'}</span>
                    <span className="feature-tile__range">
                      {f.strand === '-' ? '\u2190 ' : '\u2192 '}
                      {f.start}–{f.end}
                    </span>
                    <span className="feature-tile__type">{f.type}</span>
                    {f.notes && (
                      <span title={f.notes} className="feature-tile__notes">
                        {f.notes.length > 40 ? f.notes.slice(0, 40) + '\u2026' : f.notes}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Sequence</label>
            <textarea className="textarea" readOnly value={formatSequence(sequence.sequence)} rows={20} />
          </div>
        </>
      )}

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