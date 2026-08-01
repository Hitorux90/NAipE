// src/components/AssemblyCanvas.tsx
import { useState, useCallback } from 'react';

type ConstructPart = {
  id: string;
  part_id: string;
  start: number;
  end: number;
  strand: number;
  color?: string;
  order: number;
};

interface Props {
  constructId?: number | string;
  onSave?: () => void;
}

export default function AssemblyCanvas({ constructId, onSave }: Props) {
  const [parts, setParts] = useState<ConstructPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (constructId == null) return;
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const ps = await invoke<ConstructPart[]>('list_construct_parts', { constructId: Number(constructId) });
      setParts(ps ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load parts');
    } finally {
      setLoading(false);
    }
  }, [constructId]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-ape-part');
    if (!raw) return;
    const part = JSON.parse(raw) as { id: string; name: string };
    if (!constructId) return;
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const start = parts.reduce((max, p) => Math.max(max, p.end), 0);
      await invoke('add_part_to_construct', {
        constructId: Number(constructId),
        partId: part.id,
        start,
        end: start + 10,
        strand: 1,
        color: '#888888',
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
      const { invoke } = await import('@tauri-apps/api/core');
      const target = `C:\\ApE\\src-tauri\\target\\debug\\construct_${constructId}.dna`;
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
      <h3>Assembly Editor</h3>
      {error && <p className="error">{error}</p>}
      {saveMsg && <p className="status">{saveMsg}</p>}
      <div
        className="construct-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {loading && <p>Loading parts...</p>}
        {!loading && parts.length === 0 && <p className="empty-state">Drop parts here</p>}
        {parts.map((p) => (
          <div
            key={p.id}
            className="construct-part-tile"
            style={{ backgroundColor: p.color ?? '#888', order: p.order }}
          >
            <span className="part-label">{p.part_id}</span>
            <span className="part-coords">{p.start}-{p.end}</span>
          </div>
        ))}
      </div>
      {constructId && (
        <div className="construct-actions">
          <button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
