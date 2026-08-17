import { describe, it, expect } from 'vitest';
import {
  computeFragmentSpans,
  findSpanForCutPosition,
  isSpanSelected,
} from '../utils/restrictionUtils';
import { DigestCut } from '../src/contracts';

describe('restrictionUtils: computeFragmentSpans', () => {
  it('computes spans for circular plasmid with 2 cuts (including wrapped last fragment)', () => {
    // 5000 bp circular plasmid cut at 1000 (frag 2000) and 3000 (frag 3000)
    const cuts: DigestCut[] = [
      { enzyme: 'EcoRI', site: 'GAATTC', position: 1000, fragment_length: 2000 },
      { enzyme: 'BamHI', site: 'GGATCC', position: 3000, fragment_length: 3000 },
    ];
    const spans = computeFragmentSpans(cuts, 5000, 'circular');

    expect(spans).toHaveLength(2);
    // Span 0: 1000 -> 3000 (length 2000)
    expect(spans[0]).toEqual({
      index: 0,
      start: 1000,
      end: 3000,
      length: 2000,
      enzyme: 'EcoRI',
      isWrapped: false,
    });
    // Span 1: 3000 -> 1000 (wrapped around origin, length (5000-3000) + 1000 = 3000)
    expect(spans[1]).toEqual({
      index: 1,
      start: 3000,
      end: 1000,
      length: 3000,
      enzyme: 'BamHI',
      isWrapped: true,
    });
  });

  it('computes span for circular plasmid with 1 cut (full circle wrap)', () => {
    const cuts: DigestCut[] = [
      { enzyme: 'EcoRI', site: 'GAATTC', position: 1500, fragment_length: 4000 },
    ];
    const spans = computeFragmentSpans(cuts, 4000, 'circular');

    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({
      index: 0,
      start: 1500,
      end: 1500,
      length: 4000,
      enzyme: 'EcoRI',
      isWrapped: true,
    });
  });

  it('computes spans for linear DNA with leading fragment (post-Option A convention)', () => {
    // 1000 bp linear sequence cut at 300 and 700
    // cuts[0] is position 0 leading fragment (length 300)
    // cuts[1] is position 300 (length 400)
    // cuts[2] is position 700 (length 300)
    const cuts: DigestCut[] = [
      { enzyme: 'EcoRI', site: 'GAATTC', position: 0, fragment_length: 300 },
      { enzyme: 'EcoRI', site: 'GAATTC', position: 300, fragment_length: 400 },
      { enzyme: 'BamHI', site: 'GGATCC', position: 700, fragment_length: 300 },
    ];
    const spans = computeFragmentSpans(cuts, 1000, 'linear');

    expect(spans).toHaveLength(3);
    // Leading fragment: 0 -> 300
    expect(spans[0]).toEqual({
      index: 0,
      start: 0,
      end: 300,
      length: 300,
      enzyme: 'EcoRI',
      isWrapped: false,
    });
    // Middle fragment: 300 -> 700
    expect(spans[1]).toEqual({
      index: 1,
      start: 300,
      end: 700,
      length: 400,
      enzyme: 'EcoRI',
      isWrapped: false,
    });
    // Trailing fragment: 700 -> 1000 (totalBp)
    expect(spans[2]).toEqual({
      index: 2,
      start: 700,
      end: 1000,
      length: 300,
      enzyme: 'BamHI',
      isWrapped: false,
    });
  });

  it('handles uncut sequence cleanly', () => {
    const spans = computeFragmentSpans([], 3500, 'circular');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({
      index: 0,
      start: 1,
      end: 3500,
      length: 3500,
      enzyme: 'Uncut',
      isWrapped: false,
    });
  });
});

describe('restrictionUtils: findSpanForCutPosition', () => {
  it('finds correct span for circular cuts', () => {
    const cuts: DigestCut[] = [
      { enzyme: 'EcoRI', site: 'GAATTC', position: 1000, fragment_length: 2000 },
      { enzyme: 'BamHI', site: 'GGATCC', position: 3000, fragment_length: 3000 },
    ];
    const spans = computeFragmentSpans(cuts, 5000, 'circular');

    const span1 = findSpanForCutPosition(spans, 1000, 'circular');
    expect(span1?.start).toBe(1000);
    expect(span1?.end).toBe(3000);

    const span2 = findSpanForCutPosition(spans, 3000, 'circular');
    expect(span2?.start).toBe(3000);
    expect(span2?.end).toBe(1000);
  });

  it('finds correct span for linear cuts', () => {
    const cuts: DigestCut[] = [
      { enzyme: 'EcoRI', site: 'GAATTC', position: 0, fragment_length: 300 },
      { enzyme: 'EcoRI', site: 'GAATTC', position: 300, fragment_length: 400 },
      { enzyme: 'BamHI', site: 'GGATCC', position: 700, fragment_length: 300 },
    ];
    const spans = computeFragmentSpans(cuts, 1000, 'linear');

    const match300 = findSpanForCutPosition(spans, 300, 'linear');
    expect(match300?.start).toBe(300);
    expect(match300?.end).toBe(700);

    const match700 = findSpanForCutPosition(spans, 700, 'linear');
    expect(match700?.start).toBe(700);
    expect(match700?.end).toBe(1000);
  });

  it('matches isSpanSelected accurately', () => {
    expect(isSpanSelected({ start: 100, end: 500 }, { start: 100, end: 500 })).toBe(true);
    expect(isSpanSelected({ start: 100, end: 500 }, { start: 100, end: 600 })).toBe(false);
    expect(isSpanSelected({ start: 100, end: 500 }, null)).toBe(false);
  });
});
