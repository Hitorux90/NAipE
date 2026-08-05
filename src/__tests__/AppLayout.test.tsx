import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/App';

describe('AppLayout', () => {
  it('renders the layout structure with rail, sidebars, canvas, and status bar (right sidebar collapsed by default)', () => {
    render(<App />);
    const appRoot = document.querySelector('.app');
    expect(appRoot).toBeTruthy();

    expect(document.querySelector('.layout__rail')).toBeTruthy();
    expect(document.querySelector('.layout__sidebar--left')).toBeTruthy();
    expect(document.querySelector('.layout__canvas')).toBeTruthy();
    expect(document.querySelector('.layout__sidebar--right')).toBeNull();
    expect(document.querySelector('.layout__status-bar')).toBeTruthy();
  });

  it('renders the file explorer in the left sidebar', () => {
    render(<App />);
    expect(screen.getByText('File Explorer')).toBeTruthy();
  });

  it('renders the sequence viewer in the center canvas', () => {
    render(<App />);
    expect(screen.getByText('Sequence Viewer')).toBeTruthy();
  });

  it('renders the parts library in the right sidebar when expanded', () => {
    render(<App />);
    const toggleBtn = screen.getByText('Show right sidebar');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Parts Library')).toBeTruthy();
    expect(document.querySelector('.layout__sidebar--right')).toBeTruthy();
  });
});
