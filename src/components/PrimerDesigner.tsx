import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SequenceState } from '../src/contracts';
import { useSequenceStore } from '../store/useSequenceStore';

interface Props {
  sequence: SequenceState;
}

export default function PrimerDesigner({ sequence }: Props) {
  const { addSequence } = useSequenceStore();
  const [fwdPrimer, setFwdPrimer] = useState('');
  const [revPrimer, setRevPrimer] = useState('');
  const [fwdAnalysis, setFwdAnalysis] = useState<any>(null);
  const [revAnalysis, setRevAnalysis] = useState<any>(null);
  const [pcrResult, setPcrResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-analyze primers as user types
  useEffect(() => {
    if (fwdPrimer.trim()) {
      invoke<any>('analyze_primer', { primer: fwdPrimer })
        .then(setFwdAnalysis)
        .catch(() => setFwdAnalysis(null));
    } else {
      setFwdAnalysis(null);
    }
  }, [fwdPrimer]);

  useEffect(() => {
    if (revPrimer.trim()) {
      invoke<any>('analyze_primer', { primer: revPrimer })
        .then(setRevAnalysis)
        .catch(() => setRevAnalysis(null));
    } else {
      setRevAnalysis(null);
    }
  }, [revPrimer]);

  async function handleSimulatePcr() {
    if (!fwdPrimer.trim() || !revPrimer.trim()) {
      setError('Both forward and reverse primers are required.');
      return;
    }
    setLoading(true);
    setError(null);
    setPcrResult(null);

    try {
      const res = await invoke<any>('simulate_pcr', {
        template: sequence.sequence,
        forwardPrimer: fwdPrimer,
        reversePrimer: revPrimer,
      });

      if (res.ok) {
        setPcrResult(res);
      } else {
        setError(res.error || 'PCR Simulation failed');
      }
    } catch (err: any) {
      setError(err?.message_user || err?.message || 'PCR simulation failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAmplicon() {
    if (!pcrResult || !pcrResult.product) return;
    const name = `Amplicon_${sequence.name}_(${pcrResult.length_bp}bp)`;
    addSequence({
      id: String(Date.now()),
      name,
      sequence: pcrResult.product,
      topology: 'linear',
      length_bp: pcrResult.length_bp,
      annotations: [
        {
          id: `fwd-${Date.now()}`,
          name: `Fwd Primer (${fwdPrimer})`,
          type: 'primer_bind',
          start: 1,
          end: fwdPrimer.length,
          strand: '+',
          color: '#3B82F6',
          notes: `Tm: ${pcrResult.fwd_tm}°C`,
        },
        {
          id: `rev-${Date.now()}`,
          name: `Rev Primer (${revPrimer})`,
          type: 'primer_bind',
          start: pcrResult.length_bp - revPrimer.length + 1,
          end: pcrResult.length_bp,
          strand: '-',
          color: '#EF4444',
          notes: `Tm: ${pcrResult.rev_tm}°C`,
        },
      ],
    });
  }

  return (
    <div className="primer-designer" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)' }}>
        Primer Design & Virtual PCR Simulator
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Forward Primer Input & Metrics */}
        <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#3B82F6' }}>Forward Primer (5' → 3')</h4>
          <input
            className="input"
            value={fwdPrimer}
            onChange={(e) => setFwdPrimer(e.target.value)}
            placeholder="e.g. ATGCATGCATGC"
            style={{ width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
          {fwdAnalysis && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '12px' }}>
              <span>Length: <b>{fwdAnalysis.length} bp</b></span>
              <span>Tm: <b>{fwdAnalysis.tm_celsius}°C</b></span>
              <span>GC: <b>{fwdAnalysis.gc_percent}%</b></span>
            </div>
          )}
        </div>

        {/* Reverse Primer Input & Metrics */}
        <div className="panel" style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#EF4444' }}>Reverse Primer (5' → 3')</h4>
          <input
            className="input"
            value={revPrimer}
            onChange={(e) => setRevPrimer(e.target.value)}
            placeholder="e.g. GCGTACGTACGT"
            style={{ width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
          {revAnalysis && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '12px' }}>
              <span>Length: <b>{revAnalysis.length} bp</b></span>
              <span>Tm: <b>{revAnalysis.tm_celsius}°C</b></span>
              <span>GC: <b>{revAnalysis.gc_percent}%</b></span>
            </div>
          )}
        </div>
      </div>

      <button className="button button--primary" onClick={handleSimulatePcr} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Simulating PCR...' : 'Simulate Virtual PCR'}
      </button>

      {error && <p className="status status--error">{error}</p>}

      {/* PCR Product Output */}
      {pcrResult && pcrResult.ok && (
        <div className="panel" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--color-success, #22C55E)', background: 'var(--color-success-bg, #143F24)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--color-success, #22C55E)' }}>
              PCR Product Amplified Successfully!
            </h4>
            <button className="button button--primary" onClick={handleSaveAmplicon}>
              Add Amplicon to Workspace
            </button>
          </div>
          <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--color-text-primary)' }}>
            Amplicon Length: <b>{pcrResult.length_bp} bp</b> | Range: <b>{pcrResult.fwd_start}..{pcrResult.rev_end}</b>
          </p>
          <div style={{ marginTop: '8px' }}>
            <label className="form-label">Product Sequence Preview:</label>
            <textarea
              className="textarea"
              readOnly
              value={pcrResult.product}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
