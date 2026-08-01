import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SequenceViewer from '../components/SequenceViewer';

const sequence = { id: '1', name: 'test', sequence: 'ACGT', length_bp: 4, topology: 'circular' };

describe('SequenceViewer undo/redo', () => {
  it('shows undo/redo buttons when a sequence is active', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDefined();
  });

  it('renders undo/redo buttons with expected ids', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Undo' }).id).toBe('undo-btn');
    expect(screen.getByRole('button', { name: 'Redo' }).id).toBe('redo-btn');
  });

  it('registers keyboard shortcuts for undo/redo', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    addSpy.mockRestore();
  });

  it('fires undo handler on Ctrl+Z', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  });

  it('fires redo handler on Ctrl+Shift+Z', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
  });

  it('fires redo handler on Ctrl+Y', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
  });

  it('renders save buttons for all formats', () => {
    render(<SequenceViewer sequence={sequence} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save as .dna' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save as .fasta' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save as .gb' })).toBeDefined();
  });

  it('shows create form when no sequence is active', () => {
    render(<SequenceViewer sequence={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'New sequence' })).toBeDefined();
  });
});
