import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { getIcon, registry } from '../utils/icons';

describe('IconSystem', () => {
  it('registry exports known icons', () => {
    const names = Object.keys(registry);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('dna');
    expect(names).toContain('file-open');
    expect(names).toContain('library');
  });

  it('getIcon returns a component for valid names', () => {
    const Icon = getIcon('dna');
    const { container } = render(<Icon size={20} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('throws on unknown icon name', () => {
    expect(() => getIcon('nonexistent' as any)).toThrow('Unknown icon');
  });
});
