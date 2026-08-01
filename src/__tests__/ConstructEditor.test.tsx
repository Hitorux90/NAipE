import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConstructEditor from '../components/ConstructEditor';

const mockInvoke = vi.fn().mockResolvedValue([]);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

describe('ConstructEditor', () => {
  it('shows empty state when no constructId', () => {
    render(<ConstructEditor />);
    expect(screen.getByText(/Drop parts here/i)).toBeDefined();
  });

  it('renders construct editor with save button when constructId is provided', async () => {
    render(<ConstructEditor constructId={1} />);
    expect(screen.getByText('Assembly Editor')).toBeDefined();
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
  });
});
