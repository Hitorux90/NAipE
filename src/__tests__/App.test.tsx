import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/App';

describe('App scaffold', () => {
  it('renders three panels', () => {
    render(<App />);
    expect(screen.getByText('File Explorer')).toBeDefined();
    expect(screen.getByText('Sequence Viewer')).toBeDefined();
    expect(screen.getByText('Parts Library')).toBeDefined();
  });
});
