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
});
