import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState, Annotation } from '../src/contracts';
import { useSequenceStore } from '../store/useSequenceStore';

interface Props {
  sequence: SequenceState;
}

interface ORF {
  id: string;
  name: string;
  strand: '+' | '-';
  frame: string;
  start: number;
  end: number;
  length_bp: number;
  length_aa: number;
  translation: string;
}

export default function OrfFinder({ sequence }: Props) {
  const { updateActiveSequence } = useSequenceStore();
  const [minLen, setMinLen] = useState<number>(30);
  const [orfs, setOrfs] = useState<ORF[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrf, setSelectedOrf] = useState<ORF | null>(null);

  useEffect(() => {
    if (!sequence || !sequence.sequence) return;
    setLoading(true);
    setError(null);

    invoke<any>('find_orfs', {
      sequence: sequence.sequence,
      topology: sequence.topology,
      minLengthAa: minLen,
    })
      .then((res) => {
        const list = res.orfs || [];
        setOrfs(list);
        if (list.length > 0) setSelectedOrf(list[0]);
      })
      .catch((err: any) => {
        setError(err?.message_user || err?.message || 'Failed to scan for ORFs');
      })
      .finally(() => setLoading(false));
  }, [sequence.sequence, sequence.topology, minLen]);

  function handleAnnotateOrf(orf: ORF) {
    const newAnn: Annotation = {
      id: `orf-${Date.now()}`,
      name: orf.name,
      type: 'CDS',
      start: orf.start,
      end: orf.end,
      strand: orf.strand,
      color: orf.strand === '+' ? '#10B981' : '#8B5CF6',
      notes: `Frame ${orf.frame} | ${orf.length_aa} aa | ${orf.translation.slice(0, 30)}...`,
    };

    const updatedAnn = [...sequence.annotations, newAnn];
    updateActiveSequence({ ...sequence, annotations: updatedAnn });
  }

  return (
    <div className="orf-finder" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
          6-Frame Open Reading Frame (ORF) Finder
        </h3>

        {/* Min Length Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Min ORF Length:</label>
          <select
            className="select"
            value={minLen}
            onChange={(e) => setMinLen(Number(e.target.value))}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            <option value={10}>≥ 10 aa (30 bp)</option>
            <option value={30}>≥ 30 aa (90 bp)</option>
            <option value={50}>≥ 50 aa (150 bp)</option>
            <option value={100}>≥ 100 aa (300 bp)</option>
          </select>
        </div>
      </div>

      {loading && <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Scanning 6 reading frames for ORFs...</p>}
      {error && <p className="status status--error">{error}</p>}

      {!loading && orfs.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No ORFs found exceeding {minLen} amino acids.</p>
      )}

      {orfs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* ORF Table */}
          <div className="panel" style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--color-border-subtle)' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Frame</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Range (bp)</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Length</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orfs.map((orf) => {
                  const isSelected = selectedOrf?.id === orf.id;
                  const isFwd = orf.strand === '+';
                  return (
                    <tr
                      key={orf.id}
                      onClick={() => setSelectedOrf(orf)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'var(--color-bg-hover, rgba(59, 130, 246, 0.15))' : 'transparent',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <td style={{ padding: '6px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#FFF',
                            background: isFwd ? '#10B981' : '#8B5CF6',
                          }}
                        >
                          {orf.frame}
                        </span>
                      </td>
                      <td style={{ padding: '6px' }}>{orf.start}..{orf.end}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}><b>{orf.length_aa} aa</b> ({orf.length_bp} bp)</td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          className="button button--secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnnotateOrf(orf);
                          }}
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                        >
                          Annotate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected ORF Translation Box */}
          {selectedOrf && (
            <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-primary)' }}>
                  {selectedOrf.name} ({selectedOrf.start}..{selectedOrf.end})
                </h4>
                <button className="button button--primary" onClick={() => handleAnnotateOrf(selectedOrf)}>
                  Annotate as CDS
                </button>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '12px' }}>
                <span>Strand: <b>{selectedOrf.strand}</b></span>
                <span>Frame: <b>{selectedOrf.frame}</b></span>
                <span>Amino Acids: <b>{selectedOrf.length_aa} aa</b></span>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '11px' }}>Amino Acid Sequence:</label>
                <textarea
                  className="textarea"
                  readOnly
                  value={selectedOrf.translation}
                  rows={8}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
