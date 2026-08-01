import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AnnotationDialog from '../components/AnnotationDialog';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(42),
}));

describe('AnnotationDialog', () => {
  it('renders when open', () => {
    render(<AnnotationDialog open constructPartId={1} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/Add annotation/i)).toBeDefined();
  });

  it('submits and calls onCreated with created annotation', async () => {
    const onCreated = vi.fn();
    render(<AnnotationDialog open constructPartId={7} onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('annotation name'), { target: { value: 'myGene' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'myGene',
        construct_part_id: 7,
      }),
    );
  });
});
