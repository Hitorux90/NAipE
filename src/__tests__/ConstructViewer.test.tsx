import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConstructViewer from '../components/ConstructViewer';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'open_construct') return Promise.resolve({ id: 1, name: 'Demo', sequence_id: 1, created_at_ms: 0, parts: [] });
    return Promise.resolve(null);
  }),
}));

describe('ConstructViewer', () => {
  it('renders empty state when no constructId is provided', () => {
    render(<ConstructViewer />);
    expect(screen.getByText(/Select a construct/i)).toBeDefined();
  });

  it('renders construct metadata when loaded', async () => {
    render(<ConstructViewer constructId={1} />);
    expect(await screen.findByText('Demo')).toBeDefined();
    const ids = screen.getAllByText('1');
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No parts')).toBeDefined();
  });
});
