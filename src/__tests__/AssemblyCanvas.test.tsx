import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AssemblyCanvas from '../components/AssemblyCanvas';

const mockInvoke = vi.fn().mockResolvedValue([]);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

describe('AssemblyCanvas', () => {
  it('shows empty state when no constructId', () => {
    render(<AssemblyCanvas />);
    expect(screen.getByText(/Drop parts here/i)).toBeDefined();
  });

  it('renders assembly canvas with save button when constructId is provided', async () => {
    render(<AssemblyCanvas constructId={1} />);
    expect(screen.getByText('Assembly Editor')).toBeDefined();
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
  });
});
