import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBar from '../components/StatusBar';

describe('StatusBar', () => {
  it('renders status message', () => {
    render(<StatusBar message="Ready" />);
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('renders status indicator when provided', () => {
    render(<StatusBar message="Ready" indicator={<span>OK</span>} />);
    expect(screen.getByText('OK')).toBeTruthy();
  });
});
