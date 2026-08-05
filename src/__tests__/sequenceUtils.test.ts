import { describe, it, expect } from 'vitest';
import {
  shiftFeatureCoordinates,
  assignFeatureTracksForLine,
  sanitizeNucleotides,
  isValidNucleotideKey,
} from '../utils/sequenceUtils';
import { Annotation } from '../src/contracts';

describe('sequenceUtils', () => {
  describe('shiftFeatureCoordinates', () => {
    const annotations: Annotation[] = [
      {
        id: 'f1',
        name: 'CDS1',
        type: 'CDS',
        start: 10,
        end: 20,
        strand: '+',
        color: '#ff0000',
        notes: '',
      },
      {
        id: 'f2',
        name: 'Promoter',
        type: 'promoter',
        start: 30,
        end: 40,
        strand: '+',
        color: '#00ff00',
        notes: '',
      },
    ];

    it('shifts features right when bases are inserted before feature start', () => {
      const shifted = shiftFeatureCoordinates(annotations, 5, 3);
      expect(shifted[0].start).toBe(13);
      expect(shifted[0].end).toBe(23);
      expect(shifted[1].start).toBe(33);
      expect(shifted[1].end).toBe(43);
    });

    it('expands feature end when bases are inserted inside feature', () => {
      const shifted = shiftFeatureCoordinates(annotations, 15, 4);
      expect(shifted[0].start).toBe(10);
      expect(shifted[0].end).toBe(24);
      expect(shifted[1].start).toBe(34);
      expect(shifted[1].end).toBe(44);
    });

    it('does not shift features when bases are inserted after feature end', () => {
      const shifted = shiftFeatureCoordinates(annotations, 50, 5);
      expect(shifted[0].start).toBe(10);
      expect(shifted[0].end).toBe(20);
      expect(shifted[1].start).toBe(30);
      expect(shifted[1].end).toBe(40);
    });

    it('shifts features left when bases are deleted before feature start', () => {
      const shifted = shiftFeatureCoordinates(annotations, 2, -4);
      expect(shifted[0].start).toBe(6);
      expect(shifted[0].end).toBe(16);
      expect(shifted[1].start).toBe(26);
      expect(shifted[1].end).toBe(36);
    });
  });

  describe('assignFeatureTracksForLine', () => {
    it('assigns non-overlapping tracks for features on a 60bp line', () => {
      const annotations: Annotation[] = [
        { id: '1', name: 'A', type: 'misc', start: 5, end: 15, strand: '+', color: 'red', notes: '' },
        { id: '2', name: 'B', type: 'misc', start: 10, end: 25, strand: '+', color: 'blue', notes: '' },
        { id: '3', name: 'C', type: 'misc', start: 30, end: 45, strand: '+', color: 'green', notes: '' },
      ];

      const spans = assignFeatureTracksForLine(annotations, 1, 60);
      expect(spans.length).toBe(3);
      // Feature A & B overlap (5-15 vs 10-25), so B gets track 1
      expect(spans[0].track).toBe(0);
      expect(spans[1].track).toBe(1);
      // Feature C starts at 30, non-overlapping with A (ends at 15), so gets track 0
      expect(spans[2].track).toBe(0);
    });
  });

  describe('sanitizeNucleotides', () => {
    it('strips non-nucleotide characters and converts to uppercase', () => {
      expect(sanitizeNucleotides('atcg123 XYZ--!un')).toBe('ATCGUN');
    });
  });

  describe('isValidNucleotideKey', () => {
    it('returns true for valid nucleotide keys and control keys', () => {
      expect(isValidNucleotideKey('a')).toBe(true);
      expect(isValidNucleotideKey('G')).toBe(true);
      expect(isValidNucleotideKey('Backspace')).toBe(true);
      expect(isValidNucleotideKey('x')).toBe(false);
      expect(isValidNucleotideKey('9')).toBe(false);
    });
  });
});
