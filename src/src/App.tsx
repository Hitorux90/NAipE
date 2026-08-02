import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import FileExplorer from '../components/FileExplorer';
import SequenceViewer from '../components/SequenceViewer';
import PartsLibrary from '../components/PartsLibrary';
import DocumentTabs from '../components/DocumentTabs';
import NavRail from '../components/NavRail';
import StatusBar from '../components/StatusBar';
import SplitPane from '../components/SplitPane';
import EmptyState from '../components/EmptyState';

type Sequence = { id: string; name: string; sequence: string; length_bp: number; topology: string };

export default function App() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [parts, setParts] = useState<{ id: string; name: string }[]>([]);
  const [activeSequence, setActiveSequence] = useState<Sequence | null>(null);
  const [navSection, setNavSection] = useState<'sequences' | 'constructs'>('sequences');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectSequence = (id: string) => {
    setActiveId(id);
    const found = sequences.find((s) => s.id === id) || null;
    setActiveSequence(found);
  };

  const handleCreateSequence = (created: Sequence) => {
    setSequences((prev) => [...prev, created]);
    setActiveId(created.id);
    setActiveSequence(created);
  };

  const handleOpenSelected = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await invoke<{ id: number; name: string; sequence: string; length_bp: number; topology: string }>('open_sequence', {
        targetPath: (file as any).path || file.name,
      });
      const opened: Sequence = {
        id: String(result.id),
        name: result.name,
        sequence: result.sequence,
        length_bp: result.length_bp,
        topology: result.topology,
      };
      setSequences((prev) => {
        const exists = prev.find((s) => s.id === opened.id);
        if (!exists) return [...prev, opened];
        return prev.map((s) => (s.id === opened.id ? opened : s));
      });
      setActiveId(opened.id);
      setActiveSequence(opened);
    } catch (err: any) {
      const detail = err?.message_user ?? err?.message_dev ?? err?.message ?? JSON.stringify(err);
      window.alert(`Open failed: ${detail}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <input
        ref={fileInputRef}
        type="file"
        accept=".dna,.fasta,.gb"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <aside className="layout__rail" data-testid="nav-rail">
        <NavRail
          items={[
            { id: 'sequences', icon: 'dna', label: 'DNA' },
            { id: 'constructs', icon: 'library', label: 'Parts' },
          ]}
          activeId={navSection}
          onSelect={(id) => setNavSection(id as 'sequences' | 'constructs')}
        />
      </aside>
      <div className="layout__content">
        <SplitPane
          primaryPane="left"
          defaultSize={280}
          minSize={180}
          maxSize={400}
          left={
            <aside className="layout__sidebar--left">
              {navSection === 'sequences' ? (
                <FileExplorer
                  sequences={sequences}
                  selectedId={activeId}
                  onSelect={selectSequence}
                  onOpenSelected={handleOpenSelected}
                />
              ) : (
                <div className="panel">
                  <EmptyState message="Construct view not yet implemented" />
                </div>
              )}
            </aside>
          }
          right={
            <SplitPane
              primaryPane="right"
              defaultSize={280}
              minSize={180}
              maxSize={480}
              left={
                <main className="layout__canvas">
                  {sequences.length > 0 && (
                    <DocumentTabs tabs={sequences.map((s) => ({ id: s.id, label: s.name }))} activeId={activeId ?? ''} onSelect={selectSequence} />
                  )}
                  <SequenceViewer sequence={activeSequence} onChange={setActiveSequence} onCreateSequence={handleCreateSequence} />
                </main>
              }
              right={
                <aside className="layout__sidebar--right">
                  <PartsLibrary parts={parts} />
                </aside>
              }
            />
          }
        />
      </div>
      <StatusBar message="Ready" />
    </div>
  );
}
