import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PartsLibrary from '../components/PartsLibrary';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([
    { id: 'p001', name: 'Promoter_strong' },
    { id: 'p002', name: 'RBS' },
  ]),
}));

describe('PartsLibrary', () => {
  it('loads and displays parts', async () => {
    render(<PartsLibrary />);
    const items = await screen.findAllByText(/p001|p002/);
    expect(items.length).toBeGreaterThan(0);
  });
});
