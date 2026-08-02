// src/components/AssemblyCanvas.tsx
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import AnnotationDialog, { Annotation } from './AnnotationDialog';
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

interface PartWithAnnotations extends ConstructPart {
  annotations: Annotation[];
}

interface Props {
  constructId?: number | string;
  onSave?: () => void;
}

export default function AssemblyCanvas({ constructId, onSave }: Props) {
  const [parts, setParts] = useState<PartWithAnnotations[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [annotationsByPart, setAnnotationsByPart] = useState<Record<string, Annotation[]>>({});
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    if (constructId == null) return;
    setLoading(true);
    setError(null);
    try {
      const ps = await invoke<ConstructPart[]>('list_construct_parts', { constructId: Number(constructId) });
      const parts = ps ?? [];
      setParts(parts.map((p) => ({ ...p, annotations: [] })));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load parts');
    } finally {
      setLoading(false);
    }
  }, [constructId]);

  const loadAnnotations = useCallback(async (partId: string) => {
    try {
      const annotations = await invoke<Annotation[]>('list_annotations', { constructPartId: Number(partId) });
      setAnnotationsByPart((prev) => ({ ...prev, [partId]: annotations ?? [] }));
      setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, annotations: annotations ?? [] } : p)));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load annotations');
    }
  }, []);

  const handleCreateAnnotation = useCallback(
    async (partId: string) => {
      await loadAnnotations(partId);
    },
    [loadAnnotations],
  );

  const handlePartClick = useCallback((partId: string) => {
    setActivePartId(partId);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-ape-part');
    if (!raw) return;
    const part = JSON.parse(raw) as { id: string; name: string };
    if (!constructId) return;
    setError(null);
    try {
      const start = parts.reduce((max, p) => Math.max(max, p.end), 0);
      await invoke('add_part_to_construct', {
        constructId: Number(constructId),
        partId: part.id,
        start,
        end: start + 10,
        strand: 1,
        color: 'var(--color-part-default)',
        order: parts.length,
      });
      await load();
      setSaveMsg(`Added ${part.id}`);
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add part');
    }
  }, [constructId, parts, load]);

  const handleSave = useCallback(async () => {
    if (!constructId) return;
    setSaving(true);
    setError(null);
    try {
      /* TODO: use Tauri dialog.save() API — needs @tauri-apps/plugin-dialog */
      const target = `construct_${constructId}.dna`;
      await invoke('save_construct', { constructId: Number(constructId), targetPath: target });
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 1500);
      onSave?.();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [constructId, onSave]);

  return (
    <div className="panel construct-editor">
      <div className="panel__header">
        <h3 className="panel__title">Assembly Editor</h3>
      </div>
      {error && <ErrorBanner message={error} />}
      {saveMsg && <p className="status">{saveMsg}</p>}
      <div
        className={`construct-canvas${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); handleDrop(e); }}
      >
        {loading && <LoadingSpinner />}
        {!loading && parts.length === 0 && <EmptyState message="Drop parts here" />}
        {parts.map((p) => (
          <div
            key={p.id}
            className="construct-part-tile"
            style={{
              '--part-color': p.color ?? 'var(--color-part-default)',
              '--part-order': p.order,
            } as React.CSSProperties}
            onClick={() => handlePartClick(p.id)}
          >
            <span className="part-label">{p.part_id}</span>
            <span className="part-coords">{p.start}-{p.end}</span>
            {(p.annotations ?? []).map((a) => (
              <div
                key={a.id}
                className="annotation-overlay"
                style={{
                  '--anno-bg': a.color ?? 'var(--color-annotation-default)',
                  '--anno-left': `${((a.start - p.start) / (p.end - p.start || 1)) * 100}%`,
                  '--anno-width': `${((a.end - a.start) / (p.end - p.start || 1)) * 100}%`,
                } as React.CSSProperties}
                title={`${a.name}: ${a.feature_type} ${a.start}-${a.end}`}
              />
            ))}
          </div>
        ))}
      </div>
      {constructId && (
        <div className="construct-actions">
          <button className="button button--secondary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
      <AnnotationDialog
        open={!!activePartId}
        constructPartId={Number(activePartId)}
        onClose={() => setActivePartId(null)}
        onCreated={(annotation) => {
          setActivePartId(null);
          if (activePartId) {
            handleCreateAnnotation(activePartId);
          }
        }}
      />
    </div>
  );
}

