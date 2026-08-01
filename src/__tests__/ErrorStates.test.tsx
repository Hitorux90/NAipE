import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ErrorBanner from '../components/ErrorBanner';

describe('ErrorStates', () => {
  it('renders error message with role="alert"', () => {
    render(<ErrorBanner message="Something went wrong." />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
  });

  it('dismisses on close click and calls onDismiss', () => {
    let called = false;
    const { container } = render(<ErrorBanner message="Error" onDismiss={() => { called = true; }} />);
    expect(container.querySelector('.error-banner')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(container.querySelector('.error-banner')).toBeFalsy();
    expect(called).toBe(true);
  });
});
