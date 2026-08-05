import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/App';

describe('App scaffold', () => {
  it('renders left panel and canvas, with right sidebar collapsed by default', () => {
    render(<App />);
    expect(screen.getByText('File Explorer')).toBeDefined();
    expect(screen.getByText('Sequence Viewer')).toBeDefined();
    expect(screen.queryByText('Parts Library')).toBeNull();
    expect(screen.getByText('Show right sidebar')).toBeDefined();
  });

  it('toggles right sidebar when toggle button is clicked', () => {
    render(<App />);
    const toggleBtn = screen.getByText('Show right sidebar');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Parts Library')).toBeDefined();
    expect(screen.getByText('In development')).toBeDefined();
    expect(screen.getByText('Hide right sidebar')).toBeDefined();

    fireEvent.click(screen.getByText('Hide right sidebar'));
    expect(screen.queryByText('Parts Library')).toBeNull();
    expect(screen.getByText('Show right sidebar')).toBeDefined();
  });
});
