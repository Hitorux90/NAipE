import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState, DigestCut } from '../src/contracts';
import VirtualGel from './VirtualGel';
import { computeFragmentSpans, isSpanSelected } from '../utils/restrictionUtils';

const DEFAULT_COMMON_ENZYMES: Record<string, { site: string; cut_offset: number }> = {
  EcoRI: { site: 'GAATTC', cut_offset: 1 },
  BamHI: { site: 'GGATCC', cut_offset: 1 },
  HindIII: { site: 'AAGCTT', cut_offset: 1 },
  XhoI: { site: 'CTCGAG', cut_offset: 1 },
  NotI: { site: 'GCGGCCGC', cut_offset: 2 },
  PstI: { site: 'CTGCAG', cut_offset: 5 },
  XbaI: { site: 'TCTAGA', cut_offset: 1 },
  SpeI: { site: 'ACTAGT', cut_offset: 1 },
  NdeI: { site: 'CATATG', cut_offset: 2 },
  SacI: { site: 'GAGCTC', cut_offset: 5 },
  BglII: { site: 'AGATCT', cut_offset: 1 },
  SalI: { site: 'GTCGAC', cut_offset: 1 },
  EcoRV: { site: 'GATATC', cut_offset: 3 },
  SmaI: { site: 'CCCGGG', cut_offset: 3 },
  KpnI: { site: 'GGTACC', cut_offset: 5 },
  BsaI: { site: 'GGTCTC', cut_offset: 7 },
  BsmBI: { site: 'CGTCTC', cut_offset: 7 },
  DpnI: { site: 'GATC', cut_offset: 2 },
  ApaI: { site: 'GGGCCC', cut_offset: 5 },
  XmaI: { site: 'CCCGGG', cut_offset: 1 },
  NheI: { site: 'GCTAGC', cut_offset: 1 },
  MluI: { site: 'ACGCGT', cut_offset: 1 },
  ClaI: { site: 'ATCGAT', cut_offset: 2 },
  AgeI: { site: 'ACCGGT', cut_offset: 1 },
  AvrII: { site: 'CCTAGG', cut_offset: 1 },
  SphI: { site: 'GCATGC', cut_offset: 5 },
  StuI: { site: 'AGGCCT', cut_offset: 3 },
  PmeI: { site: 'GTTTAAAC', cut_offset: 4 },
  PacI: { site: 'TTAATTAA', cut_offset: 5 },
};

type FilterCategory = 'unique' | 'multi' | 'all_cutters' | 'non_cutters' | 'all';
type DigestMode = 'combined' | 'single';

interface Props {
  sequence: SequenceState;
  // R4: selection + digest results are lifted into SequenceViewer so they survive
  // viewMode switches and can be rendered as an overlay on Circular/Linear viewers.
  selectedEnzymes: string[];
  onSelectedEnzymesChange: (updater: string[] | ((prev: string[]) => string[])) => void;
  cuts: DigestCut[];
  digestMode: DigestMode;
  onDigestModeChange: (mode: DigestMode) => void;
  loading: boolean;
  error: string | null;
  // R5: Two-way gel <-> map linkage
  selectedFragmentSpan?: { start: number; end: number } | null;
  onFragmentClick?: (span: { start: number; end: number; length: number; enzyme: string } | null) => void;
}

export default function RestrictionMapper({
  sequence,
  selectedEnzymes,
  onSelectedEnzymesChange: setSelectedEnzymes,
  cuts,
  digestMode,
  onDigestModeChange: setDigestMode,
  loading,
  error,
  selectedFragmentSpan,
  onFragmentClick,
}: Props) {
  const [enzymeCatalog, setEnzymeCatalog] = useState<Record<string, { site: string; cut_offset: number }>>(
    DEFAULT_COMMON_ENZYMES
  );

  // New UI controls
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('unique');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNonCutters, setShowNonCutters] = useState(true);

  // Fetch full enzyme catalog from sidecar on mount
  useEffect(() => {
    fetchEnzymeCatalog();
  }, []);

  async function fetchEnzymeCatalog() {
    try {
      const res = await invoke<any>('list_enzymes');
      if (res && res.enzymes && Object.keys(res.enzymes).length > 0) {
        setEnzymeCatalog(res.enzymes);
      }
    } catch {
      // Fallback to default catalog if sidecar list_enzymes fails
    }
  }

  // Pre-calculate cut counts for each enzyme in the catalog against current sequence
  const enzymeCutCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const seqUpper = (sequence.sequence || '').toUpperCase();
    if (!seqUpper) return counts;

    const isCircular = sequence.topology?.toLowerCase() === 'circular';

    for (const [name, info] of Object.entries(enzymeCatalog)) {
      const site = info.site.toUpperCase();
      if (!site) continue;
      const searchSeq = seqUpper + (isCircular ? seqUpper.slice(0, site.length - 1) : '');
      let count = 0;
      let idx = 0;
      while (true) {
        idx = searchSeq.indexOf(site, idx);
        if (idx === -1) break;
        if (!isCircular && idx >= seqUpper.length) break;
        count++;
        idx++;
      }
      counts[name] = count;
    }
    return counts;
  }, [sequence.sequence, sequence.topology, enzymeCatalog]);

  // Summary statistics
  const stats = useMemo(() => {
    let uniqueCount = 0;
    let multiCount = 0;
    let nonCutCount = 0;
    for (const count of Object.values(enzymeCutCounts)) {
      if (count === 1) uniqueCount++;
      else if (count > 1) multiCount++;
      else nonCutCount++;
    }
    return { uniqueCount, multiCount, nonCutCount };
  }, [enzymeCutCounts]);

  // Filter enzymes to display in palette
  const displayedEnzymes = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return Object.keys(enzymeCatalog).filter((name) => {
      const info = enzymeCatalog[name];
      const count = enzymeCutCounts[name] || 0;

      // When search query is non-empty, search bypasses category filters
      if (q) {
        return name.toUpperCase().includes(q) || (info?.site || '').includes(q);
      }

      // Filter by category tab when search query is empty
      if (filterCategory === 'unique') return count === 1;
      if (filterCategory === 'multi') return count > 1;
      if (filterCategory === 'all_cutters') return count >= 1;
      if (filterCategory === 'non_cutters') return count === 0;

      // Category 'all': respect showNonCutters toggle
      if (!showNonCutters && count === 0) return false;
      return true;
    });
  }, [enzymeCatalog, enzymeCutCounts, filterCategory, searchQuery, showNonCutters]);

  const toggleEnzyme = (name: string) => {
    setSelectedEnzymes((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name]
    );
  };

  const selectAllUnique = () => {
    const uniqueEnzymes = Object.keys(enzymeCutCounts).filter((name) => enzymeCutCounts[name] === 1);
    setSelectedEnzymes(uniqueEnzymes);
  };

  const clearSelection = () => {
    setSelectedEnzymes([]);
  };

  return (
    <div className="restriction-mapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
            Restriction Enzyme Mapping
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Found <strong style={{ color: 'var(--color-primary-accent, #3B82F6)' }}>{stats.uniqueCount}</strong> 1-cutters (unique),{' '}
            <strong>{stats.multiCount}</strong> multi-cutters ({stats.nonCutCount} non-cutters)
          </p>
        </div>

        {/* Digest Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-secondary, #1E293B)', padding: '3px', borderRadius: '6px', border: '1px solid var(--color-border-subtle, #334155)' }}>
          <button
            className={`button ${digestMode === 'combined' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px', borderRadius: '4px' }}
            onClick={() => setDigestMode('combined')}
            title="Simulate combined multi-enzyme reaction in one tube"
          >
            Combined Digest (Multi-Cut)
          </button>
          <button
            className={`button ${digestMode === 'single' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px', borderRadius: '4px' }}
            onClick={() => setDigestMode('single')}
            title="Evaluate each enzyme independently"
          >
            Single-Enzyme Isolation
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: 'var(--color-bg-subtle, #0F172A)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border-subtle, #1E293B)' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            className={`button ${filterCategory === 'unique' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
            onClick={() => setFilterCategory('unique')}
          >
            1-Cutters (Unique) ({stats.uniqueCount})
          </button>
          <button
            className={`button ${filterCategory === 'multi' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
            onClick={() => setFilterCategory('multi')}
          >
            Multi-Cutters (2+) ({stats.multiCount})
          </button>
          <button
            className={`button ${filterCategory === 'all_cutters' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
            onClick={() => setFilterCategory('all_cutters')}
          >
            All Cutters ({stats.uniqueCount + stats.multiCount})
          </button>
          <button
            className={`button ${filterCategory === 'non_cutters' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
            onClick={() => setFilterCategory('non_cutters')}
          >
            Non-Cutters (0) ({stats.nonCutCount})
          </button>
          <button
            className={`button ${filterCategory === 'all' ? 'button--primary' : 'button--secondary'}`}
            style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
            onClick={() => setFilterCategory('all')}
          >
            All ({Object.keys(enzymeCatalog).length})
          </button>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          <button
            className="button button--secondary"
            style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
            onClick={selectAllUnique}
          >
            Select All 1-Cutters
          </button>
          <button
            className="button button--secondary"
            style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
            onClick={clearSelection}
          >
            Clear Selection
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ width: '100%', display: 'flex', gap: '8px', marginTop: '4px' }}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Search enzyme name (e.g. EcoRI, BsaI) or site (e.g. GAATTC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ height: '28px', fontSize: '12px', flex: 1 }}
          />
          {filterCategory === 'all' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showNonCutters}
                onChange={(e) => setShowNonCutters(e.target.checked)}
              />
              Show Non-Cutters
            </label>
          )}
        </div>
      </div>

      {/* Enzyme Palette Buttons */}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          Select Enzymes to Cut: ({selectedEnzymes.length} selected)
        </label>
        {displayedEnzymes.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0' }}>
            No enzymes match the current filter or search query.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto', padding: '4px' }}>
            {displayedEnzymes.map((name) => {
              const info = enzymeCatalog[name];
              const isSelected = selectedEnzymes.includes(name);
              const count = enzymeCutCounts[name] ?? 0;
              const isNonCutter = count === 0;
              const offsetStr = info?.cut_offset !== undefined ? ` · ${info.cut_offset}` : '';

              return (
                <button
                  key={name}
                  className={`button ${isSelected ? 'button--primary' : 'button--secondary'}`}
                  title={`${name}: ${info?.site || ''} (cut offset: ${info?.cut_offset ?? ''})`}
                  style={{
                    height: '26px',
                    fontSize: '11px',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isNonCutter && !isSelected ? 0.5 : 1,
                    border: isSelected ? '1px solid var(--color-primary-accent, #3B82F6)' : undefined,
                  }}
                  onClick={() => toggleEnzyme(name)}
                >
                  <span>{name}{offsetStr}</span>
                  <span
                    style={{
                      fontSize: '9px',
                      padding: '1px 4px',
                      borderRadius: '8px',
                      background: count === 1 ? '#10B981' : count > 1 ? '#F59E0B' : '#64748B',
                      color: '#FFF',
                      fontWeight: 'bold',
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading && <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Calculating digest cut sites...</p>}
      {error && <p className="status status--error">{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
        {/* Cut Site / Fragment Table */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {digestMode === 'combined' ? `Combined Digest Fragments (${cuts.length})` : `Cut Sites (${cuts.length})`}
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
                  <th style={{ padding: '6px' }}>Fragment Length</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const spans = computeFragmentSpans(cuts, sequence.length_bp, sequence.topology);
                  return cuts.map((cut, idx) => {
                    const span = spans[idx];
                    const isSelected = span ? isSpanSelected(span, selectedFragmentSpan) : false;
                    return (
                      <tr
                        key={`${cut.enzyme}-${cut.position}-${idx}`}
                        style={{
                          borderBottom: '1px solid var(--color-border-subtle)',
                          cursor: span ? 'pointer' : undefined,
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : undefined,
                          transition: 'background-color 0.15s ease',
                        }}
                        onClick={() => {
                          if (span && onFragmentClick) {
                            if (isSelected) {
                              onFragmentClick(null);
                            } else {
                              onFragmentClick(span);
                            }
                          }
                        }}
                        title={span ? `Click to highlight span ${span.start}–${span.end} bp` : undefined}
                      >
                        <td style={{ padding: '6px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{cut.enzyme}</td>
                        <td style={{ padding: '6px', fontFamily: 'monospace', color: 'var(--color-primary-accent)' }}>{cut.site}</td>
                        <td style={{ padding: '6px', fontFamily: 'monospace' }}>{cut.position} bp</td>
                        <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: '600', color: isSelected ? 'var(--color-primary-accent, #38BDF8)' : 'var(--color-success, #10B981)' }}>
                          {cut.fragment_length} bp
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>

        {/* Virtual Agarose Gel */}
        <VirtualGel
          sequenceName={sequence.name}
          totalBp={sequence.length_bp}
          topology={sequence.topology}
          cuts={cuts}
          selectedEnzymes={selectedEnzymes}
          selectedFragmentSpan={selectedFragmentSpan}
          onFragmentClick={onFragmentClick}
        />
      </div>
    </div>
  );
}
