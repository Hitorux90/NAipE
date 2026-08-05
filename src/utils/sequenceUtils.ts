import { Annotation } from '../src/contracts';

/**
 * Shifts feature coordinates when sequence is edited (inserted or deleted).
 * @param annotations List of annotations to shift
 * @param editPos 1-based index in sequence where edit took place
 * @param delta Number of nucleotides added (+k) or deleted (-k)
 */
export function shiftFeatureCoordinates(
  annotations: Annotation[],
  editPos: number,
  delta: number
): Annotation[] {
  if (delta === 0 || !annotations || annotations.length === 0) return annotations;

  return annotations.map((f) => {
    let newStart = f.start;
    let newEnd = f.end;

    if (delta > 0) {
      // Insertion of delta bases at editPos
      if (editPos <= f.start) {
        newStart += delta;
        newEnd += delta;
      } else if (editPos > f.start && editPos <= f.end + 1) {
        newEnd += delta;
      }
    } else {
      // Deletion of -delta bases starting at editPos
      const numDeleted = -delta;
      const deleteStart = editPos;
      const deleteEnd = editPos + numDeleted - 1;

      if (deleteEnd < f.start) {
        // Deletion completely before feature
        newStart += delta;
        newEnd += delta;
      } else if (deleteStart <= f.start && deleteEnd >= f.end) {
        // Deletion covers whole feature -> shrink to 0 length
        newStart = editPos;
        newEnd = editPos;
      } else if (deleteStart <= f.start && deleteEnd < f.end) {
        // Deletion overlaps start of feature
        const deletedOverlap = deleteEnd - f.start + 1;
        newStart = deleteStart;
        newEnd -= deletedOverlap;
      } else if (deleteStart > f.start && deleteEnd >= f.end) {
        // Deletion overlaps end of feature
        newEnd = deleteStart - 1;
      } else if (deleteStart > f.start && deleteEnd < f.end) {
        // Deletion inside feature
        newEnd -= numDeleted;
      }
    }

    return {
      ...f,
      start: Math.max(1, newStart),
      end: Math.max(1, newEnd),
    };
  });
}

export interface LineFeatureSpan {
  annotation: Annotation;
  relStart: number; // 0-indexed character offset on current 60bp line
  relEnd: number;   // 0-indexed character offset on current 60bp line
  track: number;    // Vertical track lane index (0, 1, 2...)
}

/**
 * Computes features intersecting a line segment [lineStart, lineEnd] (1-based)
 * and assigns non-overlapping vertical tracks for feature labels.
 */
export function assignFeatureTracksForLine(
  annotations: Annotation[],
  lineStart: number,
  lineEnd: number
): LineFeatureSpan[] {
  if (!annotations || annotations.length === 0) return [];

  // Filter features intersecting this line
  const lineFeatures = annotations
    .filter((f) => f.start <= lineEnd && f.end >= lineStart)
    .map((f) => {
      const relStart = Math.max(lineStart, f.start) - lineStart;
      const relEnd = Math.min(lineEnd, f.end) - lineStart;
      return { annotation: f, relStart, relEnd, track: 0 };
    });

  // Sort by relStart
  lineFeatures.sort((a, b) => a.relStart - b.relStart);

  // Assign tracks
  const trackEndPositions: number[] = [];

  return lineFeatures.map((item) => {
    let assignedTrack = 0;
    while (
      assignedTrack < trackEndPositions.length &&
      trackEndPositions[assignedTrack] >= item.relStart
    ) {
      assignedTrack++;
    }

    if (assignedTrack >= trackEndPositions.length) {
      trackEndPositions.push(item.relEnd);
    } else {
      trackEndPositions[assignedTrack] = item.relEnd;
    }

    return {
      ...item,
      track: assignedTrack,
    };
  });
}

/**
 * Filter input string to retain only valid nucleotide characters.
 */
export function sanitizeNucleotides(input: string): string {
  return input.replace(/[^acgtunACGTUN]/g, '').toUpperCase();
}

/**
 * Returns true if character is a valid nucleotide key (or navigation/control key).
 */
export function isValidNucleotideKey(key: string): boolean {
  if (key.length > 1) return true; // allow Backspace, Delete, ArrowLeft, Enter, etc.
  return /^[acgtunACGTUN]$/.test(key);
}
