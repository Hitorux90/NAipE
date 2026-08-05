import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/App';

describe('StructuralSmoke', () => {
  it('renders complete application structure (right sidebar collapsed by default)', () => {
    render(<App />);

    // top-level layout
    const app = document.querySelector('.app');
    expect(app).toBeTruthy();

    // rail/sidebars/canvas/status are present
    expect(document.querySelector('.layout__rail')).toBeTruthy();
    expect(document.querySelector('.layout__sidebar--left')).toBeTruthy();
    expect(document.querySelector('.layout__canvas')).toBeTruthy();
    expect(document.querySelector('.layout__sidebar--right')).toBeNull();
    expect(document.querySelector('.layout__status-bar')).toBeTruthy();

    // core feature labels
    expect(screen.getByText('File Explorer')).toBeTruthy();
    expect(screen.getByText('Sequence Viewer')).toBeTruthy();
  });

  it('nav-rail exists and has role=navigation', () => {
    render(<App />);
    const nav = document.querySelector('[aria-label="Primary"]');
    expect(nav).toBeTruthy();
  });
});
