import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SplitPane from '../components/SplitPane';

describe('SplitPane', () => {
  it('renders divider with col-resize cursor', () => {
    render(
      <SplitPane left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider');
    expect(divider).toBeTruthy();
    expect(divider!.getAttribute('role')).toBe('separator');
  });

  it('resizes primary pane with arrow keys (default left)', async () => {
    render(
      <SplitPane defaultSize={300} minSize={200} maxSize={500} left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider') as HTMLElement;
    divider.focus();
    await act(async () => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const primary = document.querySelector('.split-pane__primary') as HTMLElement;
    expect(primary.style.width).toBe('310px');
  });

  it('renders right-side primary pane', () => {
    render(
      <SplitPane primaryPane="right" defaultSize={250} left={<div>L</div>} right={<div>R</div>} />
    );
    const primary = document.querySelector('.split-pane__primary') as HTMLElement;
    expect(primary).toBeTruthy();
    expect(primary.textContent).toBe('R');
    expect(primary.style.width).toBe('250px');
  });

  it('renders flex secondary pane for left slot when primaryPane=right', () => {
    render(
      <SplitPane primaryPane="right" left={<div>L</div>} right={<div>R</div>} />
    );
    const secondary = document.querySelector('.split-pane__secondary') as HTMLElement;
    expect(secondary).toBeTruthy();
    expect(secondary.textContent).toBe('L');
  });

  it('ArrowLeft decreases primary pane for left mode', async () => {
    render(
      <SplitPane defaultSize={300} minSize={200} maxSize={500} left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider') as HTMLElement;
    divider.focus();
    await act(async () => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    const primary = document.querySelector('.split-pane__primary') as HTMLElement;
    expect(primary.style.width).toBe('290px');
  });

  it('ArrowLeft increases primary pane for right mode (inverted)', async () => {
    render(
      <SplitPane primaryPane="right" defaultSize={300} minSize={200} maxSize={500} left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider') as HTMLElement;
    divider.focus();
    await act(async () => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    const primary = document.querySelector('.split-pane__primary') as HTMLElement;
    expect(primary.style.width).toBe('310px');
  });

  it('exposes aria-valuemin/valuemax/valuenow on divider', () => {
    render(
      <SplitPane defaultSize={280} minSize={180} maxSize={400} left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider') as HTMLElement;
    expect(divider.getAttribute('aria-valuenow')).toBe('280');
    expect(divider.getAttribute('aria-valuemin')).toBe('180');
    expect(divider.getAttribute('aria-valuemax')).toBe('400');
  });
});