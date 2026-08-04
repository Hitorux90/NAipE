import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState } from '../src/contracts';

interface Props {
  sequence: SequenceState;
}

export default function SequenceAligner({ sequence }: Props) {
  const [querySeq, setQuerySeq] = useState('');
  const [mode, setMode] = useState<'global' | 'local'>('global');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunAlignment() {
    if (!querySeq.trim()) {
      setError('Please enter a query sequence to align against reference.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await invoke<any>('align_sequences', {
        query: querySeq,
        target: sequence.sequence,
        mode,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'Sequence alignment failed');
    } finally {
      setLoading(false);
    }
  }

  // Format alignment into blocks of 60 chars per line
  function renderAlignmentBlocks() {
    if (!result) return null;
    const q = result.aligned_query || '';
    const m = result.match_line || '';
    const t = result.aligned_target || '';
    const BLOCK = 60;
    const blocks = [];

    for (let i = 0; i < q.length; i += BLOCK) {
      const qChunk = q.slice(i, i + BLOCK);
      const mChunk = m.slice(i, i + BLOCK);
      const tChunk = t.slice(i, i + BLOCK);
      blocks.push(
        <div key={i} style={{ marginBottom: '16px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4' }}>
          <div style={{ color: '#3B82F6' }}>Query  {String(i + 1).padStart(5, ' ')}: {qChunk}</div>
          <div style={{ color: '#10B981', whiteSpace: 'pre' }}>Match        : {mChunk}</div>
          <div style={{ color: '#EC4899' }}>Target {String(i + 1).padStart(5, ' ')}: {tChunk}</div>
        </div>
      );
    }
    return blocks;
  }

  return (
    <div className="sequence-aligner" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
        Pairwise Sequence Alignment (Sanger Read / Reference Plasmid)
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Reference Target Info */}
        <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-text-primary)' }}>
            Reference Plasmid (Target)
          </h4>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            Name: <b>{sequence.name}</b> | Length: <b>{sequence.length_bp} bp</b>
          </p>
        </div>

        {/* Mode Selector */}
        <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label className="form-label" style={{ margin: 0, fontSize: '12px' }}>Alignment Mode:</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ fontSize: '12px', cursor: 'pointer' }}>
              <input type="radio" name="alignMode" value="global" checked={mode === 'global'} onChange={() => setMode('global')} /> Global (Needleman-Wunsch)
            </label>
            <label style={{ fontSize: '12px', cursor: 'pointer' }}>
              <input type="radio" name="alignMode" value="local" checked={mode === 'local'} onChange={() => setMode('local')} /> Local (Smith-Waterman)
            </label>
          </div>
        </div>
      </div>

      {/* Query Sequence Input */}
      <div>
        <label className="form-label" style={{ fontSize: '12px' }}>
          Query Sequence (Sanger Read / Fragment):
        </label>
        <textarea
          className="textarea"
          value={querySeq}
          onChange={(e) => setQuerySeq(e.target.value)}
          placeholder="Paste Sanger sequencing read or fragment DNA sequence..."
          rows={3}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box' }}
        />
      </div>

      <button className="button button--primary" onClick={handleRunAlignment} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Aligning...' : 'Run Sequence Alignment'}
      </button>

      {error && <p className="status status--error">{error}</p>}

      {/* Alignment Results */}
      {result && (
        <div className="panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
          {/* Metric Banner */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '12px' }}>
            <div>Identity: <b style={{ fontSize: '14px', color: result.identity_percent >= 90 ? '#10B981' : '#F59E0B' }}>{result.identity_percent}%</b></div>
            <div>Score: <b>{result.score}</b></div>
            <div>Matches: <b style={{ color: '#10B981' }}>{result.matches}</b></div>
            <div>Mismatches: <b style={{ color: '#EF4444' }}>{result.mismatches}</b></div>
            <div>Gaps: <b style={{ color: '#6B7280' }}>{result.gaps}</b></div>
          </div>

          {/* Visual Alignment Blocks */}
          <div style={{ overflowX: 'auto', background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: '4px' }}>
            {renderAlignmentBlocks()}
          </div>
        </div>
      )}
    </div>
  );
}
