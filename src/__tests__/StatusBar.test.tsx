import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBar from '../components/StatusBar';

describe('StatusBar', () => {
  it('renders default version placeholder', () => {
    render(<StatusBar />);
    expect(screen.getByText('NAipE v0.1.0')).toBeTruthy();
  });

  it('renders status indicator when provided', () => {
    render(<StatusBar message="Ready" indicator={<span>OK</span>} />);
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('renders status dot element', () => {
    render(<StatusBar />);
    expect(document.querySelector('.status-bar__indicator')).toBeTruthy();
  });
});
