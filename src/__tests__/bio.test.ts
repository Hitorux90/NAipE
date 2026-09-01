// src/__tests__/bio.test.ts
import { describe, it, expect } from 'vitest';
import { reverseComplement, translate } from '../utils/bio';

describe('bio utilities', () => {
  describe('reverseComplement', () => {
    it('computes reverse complement for basic ATCG sequence', () => {
      expect(reverseComplement('ATCG')).toBe('CGAT');
      expect(reverseComplement('ATGCTAC')).toBe('GTAGCAT');
    });

    it('preserves mixed casing', () => {
      expect(reverseComplement('aTgC')).toBe('GcAt');
      expect(reverseComplement('atcg')).toBe('cgat');
      expect(reverseComplement('AaTtCcGg')).toBe('cCgGaAtT');
    });

    it('returns empty string for empty input', () => {
      expect(reverseComplement('')).toBe('');
    });

    it('returns empty string on non-ATCG characters', () => {
      expect(reverseComplement('ATCGN')).toBe('');
      expect(reverseComplement('AT123CG')).toBe('');
      expect(reverseComplement('AT-CG')).toBe('');
      expect(reverseComplement('AT CG')).toBe('');
    });
  });

  describe('translate', () => {
    it('translates basic codons in frame 0', () => {
      expect(translate('ATGAAA')).toBe('MK');
      expect(translate('atgaaa')).toBe('MK');
      expect(translate('ATGGAAGTT')).toBe('MEV');
    });

    it('translates stop codons to *', () => {
      expect(translate('ATGTAA')).toBe('M*');
      expect(translate('ATGTAG')).toBe('M*');
      expect(translate('ATGTGA')).toBe('M*');
    });

    it('translates a full sequence covering all amino acids', () => {
      // ATG(M) TTT(F) TTG(L) TCT(S) TAT(Y) TGT(C) CTT(L) CCT(P) CAT(H) CAA(Q) CGT(R) ATT(I) ACT(T) AAT(N) AAA(K) AGT(S) AGA(R) GTT(V) GCT(A) GAT(D) GAA(E) GGT(G) TGG(W)
      const dna = 'ATGTTTTTGTCTTATTGTCTTCCTCATCAACGTATTACTAATAAAAGTAGAGTTGCTGATGAGGGTTGG';
      expect(translate(dna)).toBe('MFLSYCLPHQRITNKSRVADEGW');
    });

    it('ignores incomplete trailing codons at end of frame 0', () => {
      expect(translate('ATGAAAG')).toBe('MK');
      expect(translate('ATGAAAGA')).toBe('MK');
    });

    it('returns empty string for empty input', () => {
      expect(translate('')).toBe('');
    });

    it('returns empty string on non-ATCG characters', () => {
      expect(translate('ATGXAA')).toBe('');
      expect(translate('ATG123')).toBe('');
      expect(translate('ATG-AAA')).toBe('');
      expect(translate('ATG NNN')).toBe('');
    });
  });
});
