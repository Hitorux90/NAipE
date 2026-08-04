import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState, Annotation } from '../src/contracts';

interface Props {
  sequence: SequenceState;
  onChange: (updated: SequenceState) => void;
}

const PRESETS = [
  { name: 'Kozak Consensus', pattern: 'GCCGCCACCATGG' },
  { name: 'Shine-Dalgarno (RBS)', pattern: 'AGGAGG' },
  { name: 'Pribnow (-10 Box)', pattern: 'TATAAT' },
  { name: '-35 Promoter Element', pattern: 'TTGACA' },
  { name: 'PolyA Signal', pattern: 'AATAAA' },
];

const IUPAC_CODES = [
  { code: 'R', desc: 'A or G (puRine)' },
  { code: 'Y', desc: 'C or T (pYrimidine)' },
  { code: 'S', desc: 'G or C (Strong)' },
  { code: 'W', desc: 'A or T (Weak)' },
  { code: 'K', desc: 'G or T (Keto)' },
  { code: 'M', desc: 'A or C (aMino)' },
  { code: 'N', desc: 'Any (A, T, G, C)' },
];

export default function MotifSearch({ sequence, onChange }: Props) {
  const [pattern, setPattern] = useState<string>('GCCGCCACCATGG');
  const [isRegex, setIsRegex] = useState<boolean>(false);
  const [hits, setHits] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState<boolean>(false);

  async function handleSearch() {
    if (!pattern.trim()) {
      setError('Please enter a motif pattern to search.');
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(false);

    try {
      const res = await invoke<any>('search_motif', {
        sequence: sequence.sequence,
        pattern,
        isRegex,
      });

      if (res && res.hits) {
        setHits(res.hits);
        setSearched(true);
      } else {
        setError(res?.error || 'Motif search failed');
      }
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'Motif search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleInsertCode(code: string) {
    setPattern(pattern + code);
  }

  function handleAnnotateHit(hit: any) {
    const newAnn: Annotation = {
      id: String(Date.now() + Math.random()),
      name: `Motif: ${pattern}`,
      type: 'misc_feature',
      start: hit.start,
      end: hit.end,
      strand: hit.strand,
      color: '#EC4899',
      notes: `Matched sequence: ${hit.matched_sequence}`,
    };

    onChange({
      ...sequence,
      annotations: [...sequence.annotations, newAnn],
    });
    alert(`Annotated motif hit at ${hit.start}..${hit.end} bp!`);
  }

  return (
    <div className="motif-search" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
        Motif & IUPAC Degenerate Pattern Search
      </h3>

      {/* Pattern Input & Presets */}
      <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Enter IUPAC nucleotide motif (e.g. RYSWKN) or Regex"
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}
          />
          <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} />
            Regex Mode
          </label>
          <button className="button button--primary" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search Motif'}
          </button>
        </div>

        {/* IUPAC Code Insert Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>IUPAC Quick Insert:</span>
          {IUPAC_CODES.map((item) => (
            <button
              key={item.code}
              className="button button--secondary"
              onClick={() => handleInsertCode(item.code)}
              title={item.desc}
              style={{ padding: '2px 6px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }}
            >
              {item.code}
            </button>
          ))}
        </div>

        {/* Preset Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Common Presets:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              className="button button--secondary"
              onClick={() => {
                setPattern(preset.pattern);
                setIsRegex(false);
              }}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="status status--error">{error}</p>}

      {/* Results Section */}
      {searched && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Found <b>{hits.length}</b> motif match(es) for <code>{pattern}</code> in <b>{sequence.name}</b>:
          </span>

          {hits.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              No matches found for motif pattern on either strand.
            </p>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Hit #</th>
                  <th style={{ padding: '8px' }}>Location (bp)</th>
                  <th style={{ padding: '8px' }}>Strand</th>
                  <th style={{ padding: '8px' }}>Matched Sequence</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit, idx) => (
                  <tr key={hit.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '8px', color: 'var(--color-text-muted)' }}>#{idx + 1}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{hit.start} .. {hit.end}</td>
                    <td style={{ padding: '8px' }}>{hit.strand}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: '#EC4899' }}>{hit.matched_sequence}</td>
                    <td style={{ padding: '8px' }}>
                      <button className="button button--secondary" onClick={() => handleAnnotateHit(hit)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                        Annotate
                      </button>
                    </td>
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
