// src/components/PartsLibrary.tsx
import { useState, useEffect } from 'react';

type Part = { id: string; name: string; category?: string; length_bp?: number };
interface Props {
  parts?: Part[];
}

export default function PartsLibrary({ parts: externalParts }: Props) {
  const [parts, setParts] = useState<Part[]>(externalParts ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (externalParts) return;
      setLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<Part[]>('get_parts');
        if (!cancelled) setParts(items ?? []);
      } catch {
        if (!cancelled) setParts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [externalParts]);

  return (
    <div className="panel">
      <h3>Parts Library</h3>
      {loading && <p>Loading parts...</p>}
      <ul>
        {parts.map((p) => (
          <li key={p.id}>
            {p.id} {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
