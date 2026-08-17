import { DigestCut } from '../src/contracts';

export interface FragmentSpan {
  index: number;
  start: number;
  end: number;
  length: number;
  enzyme: string;
  isWrapped?: boolean;
}

/**
 * Derives fragment spans from a sorted cuts array and sequence topology.
 *
 * Post-Option A payload convention:
 * - Linear: cuts[0] is the leading fragment with position: 0 and fragment_length = cuts[1].position.
 *   Entries cuts[1..N] are the cut sites.
 *   span_start = cuts[i].position (so cuts[0] starts at 0).
 *   span_end = (i == last) ? totalBp : cuts[i+1].position.
 *
 * - Circular: N cut sites -> N entries (position: 0 is NOT present).
 *   span_start = cuts[i].position.
 *   span_end = (i == last) ? cuts[0].position : cuts[i+1].position.
 *   When i == last (or n == 1), the fragment wraps around the origin to cuts[0].position.
 *   Fragment length is (totalBp - cuts[last].position) + cuts[0].position.
 *
 * - Uncut: when cuts is empty but sequence has length, returns a single span [1, totalBp].
 */
export function computeFragmentSpans(
  cuts: DigestCut[],
  totalBp: number,
  topology: string = 'circular'
): FragmentSpan[] {
  const isCircular = topology === 'circular';

  if (!cuts || cuts.length === 0) {
    if (totalBp <= 0) return [];
    return [
      {
        index: 0,
        start: 1,
        end: totalBp,
        length: totalBp,
        enzyme: 'Uncut',
        isWrapped: false,
      },
    ];
  }

  const spans: FragmentSpan[] = [];
  const n = cuts.length;

  for (let i = 0; i < n; i++) {
    const cut = cuts[i];
    let start: number;
    let end: number;
    let isWrapped = false;

    if (isCircular) {
      start = cut.position;
      if (n === 1) {
        // Single cut on circular sequence: 1 full-circle fragment starting and ending at cut.position
        end = cut.position;
        isWrapped = true;
      } else if (i === n - 1) {
        // Last fragment wraps around origin to first cut site
        end = cuts[0].position;
        isWrapped = true;
      } else {
        end = cuts[i + 1].position;
        isWrapped = false;
      }
    } else {
      // Linear sequence (cuts[0].position == 0 is leading fragment)
      start = cut.position;
      if (i === n - 1) {
        end = totalBp;
      } else {
        end = cuts[i + 1].position;
      }
      isWrapped = false;
    }

    spans.push({
      index: i,
      start,
      end,
      length: cut.fragment_length,
      enzyme: cut.enzyme,
      isWrapped,
    });
  }

  return spans;
}

/**
 * Finds the fragment span that corresponds to or contains a specific cut position.
 */
export function findSpanForCutPosition(
  spans: FragmentSpan[],
  cutPosition: number,
  topology: string = 'circular'
): FragmentSpan | null {
  if (!spans || spans.length === 0) return null;
  const isCircular = topology === 'circular';

  // 1. Direct start match (each cut i initiates fragment i)
  const exactMatch = spans.find((s) => s.start === cutPosition);
  if (exactMatch) return exactMatch;

  // 2. Interval containment
  for (const span of spans) {
    if (isCircular) {
      if (span.isWrapped || span.start >= span.end) {
        // Wrapping fragment: [start, totalBp] or [0/1, end]
        if (cutPosition >= span.start || cutPosition < span.end) {
          return span;
        }
      } else {
        if (cutPosition >= span.start && cutPosition < span.end) {
          return span;
        }
      }
    } else {
      if (cutPosition >= span.start && cutPosition <= span.end) {
        return span;
      }
    }
  }

  return spans[0] || null;
}

export function isSpanSelected(
  span: { start: number; end: number },
  selectedSpan?: { start: number; end: number } | null
): boolean {
  if (!selectedSpan) return false;
  return span.start === selectedSpan.start && span.end === selectedSpan.end;
}
