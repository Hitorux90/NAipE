import { useState } from 'react';
import FileExplorer from '../components/FileExplorer';
import SequenceViewer from '../components/SequenceViewer';
import PartsLibrary from '../components/PartsLibrary';

type Sequence = { id: string; name: string; sequence: string; length_bp: number; topology: string };

export default function App() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [parts, setParts] = useState<{ id: string; name: string }[]>([]);
  const [activeSequence, setActiveSequence] = useState<Sequence | null>(null);

  const selectSequence = (id: string) => {
    setActiveId(id);
    const found = sequences.find((s) => s.id === id) || null;
    setActiveSequence(found);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: '20%', borderRight: '1px solid #ccc' }}>
        <FileExplorer
          sequences={sequences}
          selectedId={activeId}
          onSelect={selectSequence}
          onOpenSelected={() => {
            // TODO: open_sequence needs a stored file path per sequence;
            // current list view does not carry one.
            window.alert('Open selected sequence: file path wiring pending.');
          }}
        />
      </div>
      <div style={{ width: '55%' }}>
        <SequenceViewer sequence={activeSequence} onChange={(u) => setActiveSequence(u)} />
      </div>
      <div style={{ width: '25%', borderLeft: '1px solid #ccc' }}>
        <PartsLibrary parts={parts} />
      </div>
    </div>
  );
}
