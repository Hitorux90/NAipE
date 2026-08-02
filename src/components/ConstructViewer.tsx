// src/components/ConstructViewer.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ErrorBanner from './ErrorBanner';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

type ConstructPart = {
  id: string;
  part_id: string;
  start: number;
  end: number;
  strand: number;
  color?: string;
  order: number;
};

type Construct = {
  id: number;
  name: string;
  sequence_id: number;
  created_at_ms: number;
  parts: ConstructPart[];
};

interface Props {
  constructId?: number | string;
}

export default function ConstructViewer({ constructId }: Props) {
  const [construct, setConstruct] = useState<Construct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (constructId == null) return;
    let cancelled = false;
    async function load() {
      setError(null);
      setConstruct(null);
      try {
        
        const c = await invoke<Construct>('open_construct', { constructId: Number(constructId) });
        if (!cancelled) setConstruct(c);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load construct');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [constructId]);

  if (constructId == null) {
    return (
      <div className="panel">
        <EmptyState message="Select a construct to view" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!construct) {
    return (
      <div className="panel">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="panel construct-viewer">
      <div className="panel__header">
        <h3 className="panel__title">{construct.name}</h3>
      </div>
      <dl className="construct-meta">
        <dt>ID</dt><dd>{construct.id}</dd>
        <dt>Sequence</dt><dd>{construct.sequence_id}</dd>
        <dt>Parts</dt><dd>{construct.parts.length}</dd>
      </dl>
      <div className="construct-canvas" role="img" aria-label={`${construct.name} assembly map`}>
        {construct.parts.length === 0 && <p className="empty-state">No parts</p>}
        {construct.parts.map((part) => (
          <div
            key={part.id}
            className="construct-part-tile"
            style={{
              '--part-color': part.color ?? 'var(--color-part-default)',
              '--part-order': part.order,
            } as React.CSSProperties}
            title={`${part.part_id}: ${part.start}-${part.end}${part.strand < 0 ? ' reverse' : ''}`}
          >
            <span className="part-label">{part.part_id}</span>
            <span className="part-coords">{part.start}-{part.end}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
