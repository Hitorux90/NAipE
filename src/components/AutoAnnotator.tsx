import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState, Annotation } from '../src/contracts';

interface Props {
  sequence: SequenceState;
  onChange: (updated: SequenceState) => void;
}

export default function AutoAnnotator({ sequence, onChange }: Props) {
  const [hits, setHits] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  async function handleScan() {
    if (!sequence || !sequence.sequence) {
      setError('No DNA sequence available to scan.');
      return;
    }
    setLoading(true);
    setError(null);
    setScanned(false);

    try {
      const res = await invoke<any>('auto_annotate', {
        sequence: sequence.sequence,
        minIdentity: 90.0,
      });

      if (res && res.hits) {
        setHits(res.hits);
        setSelectedIds(new Set(res.hits.map((h: any) => h.id)));
        setScanned(true);
      } else {
        setError('Auto-annotation scan returned no hits');
      }
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'Auto-annotation scan failed');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function handleApplySelected() {
    const toAdd: Annotation[] = hits
      .filter((h) => selectedIds.has(h.id))
      .map((h) => ({
        id: String(Date.now() + Math.random()),
        name: h.name,
        type: h.type,
        start: h.start,
        end: h.end,
        strand: h.strand,
        color: h.color,
        notes: h.notes,
      }));

    if (toAdd.length === 0) return;

    const updated: SequenceState = {
      ...sequence,
      annotations: [...sequence.annotations, ...toAdd],
    };

    onChange(updated);
    alert(`Successfully added ${toAdd.length} feature annotations to ${sequence.name}!`);
  }

  return (
    <div className="auto-annotator" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
          Automated Feature Annotation Engine
        </h3>
        <button className="button button--primary" onClick={handleScan} disabled={loading}>
          {loading ? 'Scanning...' : 'Scan Plasmid for Standard Features'}
        </button>
      </div>

      {error && <p className="status status--error">{error}</p>}

      {scanned && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Found <b>{hits.length}</b> standard biological features in <b>{sequence.name}</b>:
            </span>
            <button
              className="button button--secondary"
              onClick={handleApplySelected}
              disabled={selectedIds.size === 0}
            >
              Apply Selected ({selectedIds.size}) to Sequence
            </button>
          </div>

          {hits.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              No standard feature database matches were found in this sequence.
            </p>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Select</th>
                  <th style={{ padding: '8px' }}>Feature Name</th>
                  <th style={{ padding: '8px' }}>Type</th>
                  <th style={{ padding: '8px' }}>Strand</th>
                  <th style={{ padding: '8px' }}>Location (bp)</th>
                  <th style={{ padding: '8px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(hit.id)}
                        onChange={() => toggleSelect(hit.id)}
                      />
                    </td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: hit.color }}>{hit.name}</td>
                    <td style={{ padding: '8px' }}>{hit.type}</td>
                    <td style={{ padding: '8px' }}>{hit.strand}</td>
                    <td style={{ padding: '8px' }}>{hit.start} .. {hit.end}</td>
                    <td style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '11px' }}>{hit.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
