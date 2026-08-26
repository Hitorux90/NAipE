import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SequenceViewer from '../components/SequenceViewer';
import { type Sequence } from '../components/SequenceViewer';

const sampleSequence: Sequence = {
  id: '1',
  name: 'TestSeq',
  sequence: 'ATCG',
  length_bp: 4,
  topology: 'circular',
};

describe('SequenceViewer', () => {
  it('renders viewer header when sequence is active', () => {
    render(<SequenceViewer sequence={sampleSequence} onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Sequence' })).toBeTruthy();
    expect(screen.getByDisplayValue('TestSeq')).toBeTruthy();
  });

  it('shows save buttons when sequence is active', () => {
    render(<SequenceViewer sequence={sampleSequence} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /save as \.dna/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save as \.fasta/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save as \.gb/i })).toBeTruthy();
  });

  it('renders create sequence form when no sequence is active', () => {
    render(<SequenceViewer sequence={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /new sequence/i })).toBeTruthy();
  });

  it('uses .button-group wrapper around action buttons when sequence is active', () => {
    render(<SequenceViewer sequence={sampleSequence} onChange={() => {}} />);
    const buttonGroup = document.querySelector('.button-group');
    expect(buttonGroup).toBeTruthy();
  });

  it('uses monospace font on textarea when sequence is active', () => {
    render(<SequenceViewer sequence={sampleSequence} onChange={() => {}} />);
    const textarea = document.querySelector('.textarea');
    expect(textarea).toBeTruthy();
    expect(textarea?.className).toContain('textarea');
  });

  it('has no static inline styles in JSX', () => {
    const html = require('fs').readFileSync('components/SequenceViewer.tsx', 'utf8');
    const styleMatches = html.match(/style=\{\{/g);
    expect(styleMatches).toBeNull();
  });

  it('copies contiguous sequence on native copy event when DOM selection has whitespace', () => {
    render(<SequenceViewer sequence={sampleSequence} onChange={() => {}} />);
    const seqWindow = document.querySelector('.seq-window');
    expect(seqWindow).toBeTruthy();

    const setDataMock = vi.fn();

    const originalGetSelection = window.getSelection;
    window.getSelection = () => ({
      toString: () => 'A T C G',
    } as any);

    const copyEvent = createEvent.copy(seqWindow!, {
      clipboardData: {
        setData: setDataMock,
      },
    });

    fireEvent(seqWindow!, copyEvent);

    expect(setDataMock).toHaveBeenCalledWith('text/plain', 'ATCG');
    expect(copyEvent.defaultPrevented).toBe(true);

    window.getSelection = originalGetSelection;
  });

  it('copies exact unspaced sequence on native copy event when feature is selected', () => {
    const seqWithFeature: Sequence = {
      ...sampleSequence,
      sequence: 'ATGCATGCATGC',
      length_bp: 12,
      annotations: [
        { id: 'f1', name: 'GeneA', type: 'gene', start: 3, end: 8, strand: '+', color: '#ff0000' },
      ],
    };
    render(<SequenceViewer sequence={seqWithFeature} onChange={() => {}} />);

    const featureTile = document.querySelector('.feature-tile');
    expect(featureTile).toBeTruthy();
    fireEvent.click(featureTile!);

    const seqWindow = document.querySelector('.seq-window');
    const setDataMock = vi.fn();

    const copyEvent = createEvent.copy(seqWindow!, {
      clipboardData: {
        setData: setDataMock,
      },
    });

    fireEvent(seqWindow!, copyEvent);

    expect(setDataMock).toHaveBeenCalledWith('text/plain', 'GCATGC');
    expect(copyEvent.defaultPrevented).toBe(true);
  });

  it('copies selected feature sequence via Ctrl+C', () => {
    const writeTextMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const seqWithFeature: Sequence = {
      ...sampleSequence,
      sequence: 'ATGCATGCATGC',
      length_bp: 12,
      annotations: [
        { id: 'f1', name: 'GeneA', type: 'gene', start: 3, end: 8, strand: '+', color: '#ff0000' },
      ],
    };
    render(<SequenceViewer sequence={seqWithFeature} onChange={() => {}} />);

    const featureTile = document.querySelector('.feature-tile');
    expect(featureTile).toBeTruthy();
    fireEvent.click(featureTile!);

    const seqWindow = document.querySelector('.seq-window');
    fireEvent.keyDown(seqWindow!, { key: 'c', ctrlKey: true });

    expect(writeTextMock).toHaveBeenCalledWith('GCATGC');
  });

  it('cuts selected feature sequence via Ctrl+X and updates sequence', () => {
    const writeTextMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    const onChangeMock = vi.fn();

    const seqWithFeature: Sequence = {
      ...sampleSequence,
      sequence: 'ATGCATGCATGC',
      length_bp: 12,
      annotations: [
        { id: 'f1', name: 'GeneA', type: 'gene', start: 3, end: 8, strand: '+', color: '#ff0000' },
      ],
    };
    render(<SequenceViewer sequence={seqWithFeature} onChange={onChangeMock} />);

    const featureTile = document.querySelector('.feature-tile');
    expect(featureTile).toBeTruthy();
    fireEvent.click(featureTile!);

    const seqWindow = document.querySelector('.seq-window');
    fireEvent.keyDown(seqWindow!, { key: 'x', ctrlKey: true });

    expect(writeTextMock).toHaveBeenCalledWith('GCATGC');
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: 'ATATGC',
        length_bp: 6,
      })
    );
  });
});

