import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FileExplorer from '../components/FileExplorer';

describe('FileExplorer', () => {
  it('renders file explorer header', () => {
    render(<FileExplorer sequences={[]} onSelect={() => {}} />);
    expect(screen.getByText(/file explorer/i)).toBeDefined();
  });
});
