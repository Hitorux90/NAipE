import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingOverlay from '../components/LoadingOverlay';
import LoadingSpinner from '../components/LoadingSpinner';

describe('LoadingStates', () => {
  it('renders overlay with spinner and text', () => {
    render(<LoadingOverlay label="Loading…" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(document.querySelector('.loading-overlay')).toBeTruthy();
    expect(document.querySelector('.spinner')).toBeTruthy();
  });

  it('renders standalone spinner', () => {
    render(<LoadingSpinner />);
    expect(document.querySelector('.spinner')).toBeTruthy();
  });
});
