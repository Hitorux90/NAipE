// src/components/AnnotationDialog.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type Annotation = {
  id: number;
  construct_part_id: number;
  name: string;
  feature_type: string;
  start: number;
  end: number;
  strand: number;
  color?: string;
  created_at_ms: number;
};

type Props = {
  open: boolean;
  constructPartId: number;
  defaultStart?: number;
  defaultEnd?: number;
  onClose: () => void;
  onCreated: (annotation: Annotation) => void;
};

export default function AnnotationDialog({ open, constructPartId, defaultStart = 0, defaultEnd = 100, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [featureType, setFeatureType] = useState('gene');
  const [start, setStart] = useState(`${defaultStart}`);
  const [end, setEnd] = useState(`${defaultEnd}`);
  const [strand, setStrand] = useState('1');
  const [color, setColor] = useState('#ff0000');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      
      const id = await invoke<number>('create_annotation', {
        constructPartId,
        name: name || 'unnamed',
        featureType,
        start: Number(start),
        end: Number(end),
        strand: Number(strand),
        color,
      });
      onCreated({
        id,
        construct_part_id: constructPartId,
        name: name || 'unnamed',
        feature_type: featureType,
        start: Number(start),
        end: Number(end),
        strand: Number(strand),
        color,
        created_at_ms: Date.now(),
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create annotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h4>Add annotation</h4>
        <label>
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="annotation name" required />
        </label>
        <label>
          Feature type
          <select className="select" value={featureType} onChange={(e) => setFeatureType(e.target.value)}>
            <option value="gene">gene</option>
            <option value="promoter">promoter</option>
            <option value="terminator">terminator</option>
            <option value="misc">misc</option>
          </select>
        </label>
        <label>
          Start
          <input className="input" type="number" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          End
          <input className="input" type="number" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
        <label>
          Strand
          <select className="select" value={strand} onChange={(e) => setStrand(e.target.value)}>
            <option value="1">1</option>
            <option value="-1">-1</option>
          </select>
        </label>
        <label>
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
