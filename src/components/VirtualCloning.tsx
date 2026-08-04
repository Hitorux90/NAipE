import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState } from '../src/contracts';
import { useSequenceStore } from '../store/useSequenceStore';

interface Props {
  sequence: SequenceState;
}

interface PartInput {
  name: string;
  sequence: string;
}

export default function VirtualCloning({ sequence }: Props) {
  const { addSequence } = useSequenceStore();
  const [method, setMethod] = useState<string>('gibson');
  const [parts, setParts] = useState<PartInput[]>([
    { name: sequence.name, sequence: sequence.sequence },
    { name: 'Insert_Fragment', sequence: 'ATGCATGCATGCATGCATGCATGC' },
  ]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddPart() {
    setParts([...parts, { name: `Fragment_${parts.length + 1}`, sequence: '' }]);
  }

  function handleUpdatePart(idx: number, field: 'name' | 'sequence', val: string) {
    const updated = [...parts];
    updated[idx][field] = val;
    setParts(updated);
  }

  function handleRemovePart(idx: number) {
    if (parts.length <= 1) return;
    setParts(parts.filter((_, i) => i !== idx));
  }

  async function handleSimulate() {
    const validParts = parts.filter((p) => p.sequence.trim().length > 0);
    if (validParts.length === 0) {
      setError('Please provide at least 1 DNA fragment sequence to assemble.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await invoke<any>('simulate_assembly', {
        parts: validParts,
        method,
      });

      if (res.ok) {
        setResult(res);
      } else {
        setError(res.error || 'Virtual Assembly failed');
      }
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'Virtual Assembly simulation failed');
    } finally {
      setLoading(false);
    }
  }

  function handleLoadIntoWorkspace() {
    if (!result || !result.assembled_sequence) return;
    const name = `Assembled_Plasmid_${Date.now().toString().slice(-4)}`;
    addSequence({
      id: String(Date.now()),
      name,
      sequence: result.assembled_sequence,
      topology: result.topology || 'circular',
      length_bp: result.length_bp,
      annotations: result.annotations || [],
    });
  }

  return (
    <div className="virtual-cloning" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
        Virtual Assembly & Molecular Cloning Simulator
      </h3>

      {/* Method Selector */}
      <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <label className="form-label" style={{ margin: 0, fontSize: '12px' }}>Assembly Method:</label>
        <select
          className="select"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          style={{ padding: '4px 12px', fontSize: '12px' }}
        >
          <option value="gibson">Gibson Assembly (Homology Overlap)</option>
          <option value="goldengate_bsai">Golden Gate (BsaI Type IIS)</option>
          <option value="goldengate_bsmbi">Golden Gate (BsmBI Type IIS)</option>
          <option value="restriction">Restriction & Ligation</option>
        </select>
      </div>

      {/* Part Fragments List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>DNA Fragment Inputs:</h4>
          <button className="button button--secondary" onClick={handleAddPart} style={{ padding: '2px 8px', fontSize: '11px' }}>
            + Add DNA Fragment
          </button>
        </div>

        {parts.map((part, idx) => (
          <div key={idx} className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', display: 'grid', gridTemplateColumns: '180px 1fr 40px', gap: '12px', alignItems: 'center' }}>
            <input
              className="input"
              value={part.name}
              onChange={(e) => handleUpdatePart(idx, 'name', e.target.value)}
              placeholder="Fragment Name"
              style={{ fontSize: '12px' }}
            />
            <textarea
              className="textarea"
              value={part.sequence}
              onChange={(e) => handleUpdatePart(idx, 'sequence', e.target.value)}
              placeholder="DNA Sequence (5' → 3')"
              rows={2}
              style={{ fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box' }}
            />
            <button
              className="button button--secondary"
              onClick={() => handleRemovePart(idx)}
              disabled={parts.length <= 1}
              style={{ color: '#EF4444', padding: '4px' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button className="button button--primary" onClick={handleSimulate} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Assembling...' : 'Simulate Virtual Assembly'}
      </button>

      {error && <p className="status status--error">{error}</p>}

      {/* Assembled Construct Result */}
      {result && result.ok && (
        <div className="panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-success, #22C55E)', background: 'var(--color-success-bg, #143F24)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--color-success, #22C55E)' }}>
              Virtual Assembly Completed!
            </h4>
            <button className="button button--primary" onClick={handleLoadIntoWorkspace}>
              Load Assembled Plasmid into Workspace
            </button>
          </div>
          <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--color-text-primary)' }}>
            Assembled Length: <b>{result.length_bp} bp</b> | Topology: <b>{result.topology}</b> | Method: <b>{result.method}</b>
          </p>

          {result.junctions && result.junctions.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              <b>Junctions Recombined:</b>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {result.junctions.map((j: any, i: number) => (
                  <li key={i}>{j.from_part} ➔ {j.to_part} ({j.overlap_bp} bp overlap)</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <label className="form-label">Assembled Sequence Preview:</label>
            <textarea
              className="textarea"
              readOnly
              value={result.assembled_sequence}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
