import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NavRail from '../components/NavRail';

describe('NavRail', () => {
  it('renders navigation items', () => {
    render(<NavRail items={[{id:'1',icon:'dna',label:'DNA'}]} activeId="1" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /dna/i })).toBeTruthy();
  });
});
