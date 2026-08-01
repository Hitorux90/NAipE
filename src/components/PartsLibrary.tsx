// src/components/PartsLibrary.tsx
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Part = { id: string; name: string; category?: string; length_bp?: number };
interface Props {
  parts?: Part[];
  onAddToConstruct?: (part: Part, index?: number) => void;
}

export default function PartsLibrary({ parts: externalParts, onAddToConstruct }: Props) {
  const [parts, setParts] = useState<Part[]>(externalParts ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (externalParts) return;
      try {
        
        const items = await invoke<Part[]>('get_parts');
        if (!cancelled) setParts(items ?? []);
      } catch {
        if (!cancelled) setParts([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [externalParts]);

  const handleDragStart = useCallback((e: React.DragEvent, part: Part) => {
    const payload = JSON.stringify(part);
    e.dataTransfer.setData('application/x-ape-part', payload);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleClick = useCallback((part: Part) => {
    setSelectedId(part.id);
  }, []);

  const handleDoubleClick = useCallback((part: Part) => {
    onAddToConstruct?.(part);
  }, [onAddToConstruct]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, part: Part) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAddToConstruct?.(part);
    }
  }, [onAddToConstruct]);

  return (
    <div className="panel">
      <h3>Parts Library</h3>
      <ul className="parts-list">
        {parts.map((p, idx) => (
          <li
            key={p.id}
            draggable
            tabIndex={0}
            role="option"
            aria-selected={selectedId === p.id}
            className={`part-item${selectedId === p.id ? ' selected' : ''}`}
            onDragStart={(e) => handleDragStart(e, p)}
            onClick={() => handleClick(p)}
            onDoubleClick={() => handleDoubleClick(p)}
            onKeyDown={(e) => handleKeyDown(e, p)}
            data-part-id={p.id}
            data-part-index={idx}
          >
            <span className="part-id">{p.id}</span>
            <span className="part-name">{p.name}</span>
            {p.category && <span className="part-category">{p.category}</span>}
            {p.length_bp != null && <span className="part-length">{p.length_bp}bp</span>}
          </li>
        ))}
      </ul>
      <p className="parts-hint">Drag or double-click to add</p>
    </div>
  );
}
