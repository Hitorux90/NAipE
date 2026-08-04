import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState, DigestCut } from '../src/contracts';
import VirtualGel from './VirtualGel';

const COMMON_ENZYMES = [
  'EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NotI', 
  'PstI', 'XbaI', 'SpeI', 'NdeI', 'SacI', 'BglII', 'SalI'
];

interface Props {
  sequence: SequenceState;
}

export default function RestrictionMapper({ sequence }: Props) {
  const [selectedEnzymes, setSelectedEnzymes] = useState<string[]>(['EcoRI', 'BamHI']);
  const [cuts, setCuts] = useState<DigestCut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runDigest();
  }, [sequence.sequence, sequence.topology, selectedEnzymes]);

  async function runDigest() {
    if (selectedEnzymes.length === 0 || !sequence.sequence) {
      setCuts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any>('digest_sequence', {
        sequence: sequence.sequence,
        topology: sequence.topology,
        enzymes: selectedEnzymes,
      });
      setCuts(res.cuts || []);
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'Digest failed');
    } finally {
      setLoading(false);
    }
  }

  const toggleEnzyme = (name: string) => {
    setSelectedEnzymes((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name]
    );
  };

  return (
    <div className="restriction-mapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
        Restriction Enzyme Mapping
      </h3>

      {/* Enzyme Palette Buttons */}
      <div className="form-group">
        <label className="form-label">Select Enzymes:</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {COMMON_ENZYMES.map((name) => {
            const isSelected = selectedEnzymes.includes(name);
            return (
              <button
                key={name}
                className={`button ${isSelected ? 'button--primary' : 'button--secondary'}`}
                style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                onClick={() => toggleEnzyme(name)}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Calculating digest cut sites...</p>}
      {error && <p className="status status--error">{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
        {/* Cut Site Table */}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Cut Sites ({cuts.length})
          </h4>
          {cuts.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>No cut sites found for selected enzymes.</p>
          ) : (
            <table className="table" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: '6px' }}>Enzyme</th>
                  <th style={{ padding: '6px' }}>Site</th>
                  <th style={{ padding: '6px' }}>Position</th>
                  <th style={{ padding: '6px' }}>Fragment</th>
                </tr>
              </thead>
              <tbody>
                {cuts.map((cut, idx) => (
                  <tr key={`${cut.enzyme}-${cut.position}-${idx}`} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '6px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{cut.enzyme}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-primary-accent)' }}>{cut.site}</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>{cut.position} bp</td>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>{cut.fragment_length} bp</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Virtual Agarose Gel */}
        <VirtualGel
          sequenceName={sequence.name}
          totalBp={sequence.length_bp}
          cuts={cuts}
          selectedEnzymes={selectedEnzymes}
        />
      </div>
    </div>
  );
}
