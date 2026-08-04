import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState } from '../src/contracts';

interface Props {
  sequence: SequenceState;
}

export default function BiochemicalPlots({ sequence }: Props) {
  const [winSize, setWinSize] = useState<number>(50);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sequence || !sequence.sequence) return;
    setLoading(true);
    setError(null);

    invoke<any>('compute_properties', {
      sequence: sequence.sequence,
      windowSize: winSize,
      step: Math.max(1, Math.floor(winSize / 5)),
    })
      .then(setData)
      .catch((err: any) => setError(err?.message_user || err?.message || 'Failed to compute properties'))
      .finally(() => setLoading(false));
  }, [sequence.sequence, winSize]);

  // Render SVG profile curve for GC %
  function renderGcChart() {
    if (!data || !data.gc_profile || data.gc_profile.length === 0) return null;
    const width = 700;
    const height = 180;
    const padding = 30;

    const points: [number, number][] = data.gc_profile.map((val: number, i: number) => {
      const x = padding + (i / (data.gc_profile.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - (val / 100) * (height - 2 * padding);
      return [x, y];
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {/* Background & grid lines */}
        <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} fill="var(--color-bg-secondary, #1E293B)" rx={4} />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--color-border-subtle, #334155)" strokeDasharray="4 4" />

        {/* 50% GC baseline mark */}
        <text x={padding + 4} y={height / 2 - 4} fill="var(--color-text-muted, #94A3B8)" fontSize="10">50% GC</text>

        {/* GC Profile Line */}
        <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#10B981">
            <title>{`Pos ${data.positions[i]} bp | GC: ${data.gc_profile[i]}% | Tm: ${data.tm_profile[i]}°C`}</title>
          </circle>
        ))}

        {/* X-axis labels */}
        <text x={padding} y={height - 8} fill="var(--color-text-secondary)" fontSize="10">1 bp</text>
        <text x={width - padding - 30} y={height - 8} fill="var(--color-text-secondary)" fontSize="10">{data.length_bp} bp</text>
      </svg>
    );
  }

  return (
    <div className="biochemical-plots" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
          Biochemical Property Plots & Thermodynamic Profile
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Sliding Window Size:</label>
          <select
            className="select"
            value={winSize}
            onChange={(e) => setWinSize(Number(e.target.value))}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            <option value={20}>20 bp window</option>
            <option value={50}>50 bp window</option>
            <option value={100}>100 bp window</option>
            <option value={200}>200 bp window</option>
          </select>
        </div>
      </div>

      {loading && <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Calculating property profiles...</p>}
      {error && <p className="status status--error">{error}</p>}

      {data && (
        <>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>Overall GC Content</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>{data.overall_gc}%</p>
            </div>
            <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>Average Melting Temp (Tm)</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#3B82F6' }}>{data.overall_tm}°C</p>
            </div>
            <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>Molecular Weight (dsDNA)</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#EC4899' }}>{data.mw_kda} kDa</p>
            </div>
          </div>

          {/* Interactive Profile Chart */}
          <div className="panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-primary)' }}>
                Sliding Window GC % Profile across Sequence Length
              </h4>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Hover nodes for exact values</span>
            </div>
            {renderGcChart()}
          </div>
        </>
      )}
    </div>
  );
}
