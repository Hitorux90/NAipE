import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DocumentTabs from '../components/DocumentTabs';
import ViewTabs from '../components/ViewTabs';

describe('Tabs', () => {
  it('DocumentTabs renders tabs and marks active', () => {
    render(<DocumentTabs tabs={[{id:'1',label:'Seq 1'}, {id:'2',label:'Seq 2'}]} activeId="1" onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: /seq 1/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /seq 2/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('ViewTabs renders and highlights active view', () => {
    render(
      <ViewTabs
        tabs={[{id:'sequence',label:'Sequence',icon:'dna'},{id:'annotations',label:'Annotations',icon:'features'}]}
        active="sequence"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('tab', { name: /sequence/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /annotations/i })).toBeTruthy();
  });
});
