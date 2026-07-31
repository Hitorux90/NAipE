import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SequenceViewer from '../components/SequenceViewer';

describe('SequenceViewer', () => {
  it('shows new sequence form when no sequence is active', () => {
    render(<SequenceViewer sequence={null} onChange={() => {}} />);
    expect(screen.getByText('New sequence')).toBeDefined();
  });
});
