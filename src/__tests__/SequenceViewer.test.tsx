import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Sequence Viewer')).toBeTruthy();
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
});
