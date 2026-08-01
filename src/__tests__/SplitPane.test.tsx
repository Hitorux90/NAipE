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
    expect((divider as HTMLElement)!.style.cursor).toBe('col-resize');
  });

  it('resizes left pane with arrow keys', async () => {
    render(
      <SplitPane defaultLeftWidth={300} minLeftWidth={200} maxLeftWidth={500} left={<div>L</div>} right={<div>R</div>} />
    );
    const divider = document.querySelector('.split-pane__divider') as HTMLElement;
    divider.focus();
    await act(async () => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const left = document.querySelector('.split-pane__left') as HTMLElement;
    expect(left.style.width).toBe('310px');
  });
});
