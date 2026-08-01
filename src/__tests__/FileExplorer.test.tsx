import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FileExplorer from '../components/FileExplorer';

describe('FileExplorer', () => {
  it('renders file explorer header with icon', () => {
    render(<FileExplorer sequences={[]} selectedId={null} onSelect={() => {}} onOpenSelected={() => {}} />);
    expect(screen.getByText(/file explorer/i)).toBeTruthy();
  });

  it('renders open file button', () => {
    render(<FileExplorer sequences={[]} selectedId={null} onSelect={() => {}} onOpenSelected={() => {}} />);
    expect(screen.getByRole('button', { name: /open file/i })).toBeTruthy();
  });
});
