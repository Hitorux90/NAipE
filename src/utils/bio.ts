// src/utils/bio.ts

/**
 * Standard genetic code codon translation table (NCBI Table 1).
 * Maps 64 triplet codons to single-letter amino acid codes or '*' for stop codons.
 */
const CODON_TABLE: Record<string, string> = {
  // T
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  // C
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  // A
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  // G
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

const COMPLEMENT_MAP: Record<string, string> = {
  A: 'T',
  T: 'A',
  C: 'G',
  G: 'C',
  a: 't',
  t: 'a',
  c: 'g',
  g: 'c',
};

/**
 * Computes the reverse complement of a DNA sequence.
 * Complements A<->T, C<->G (case-preserving), then reverses the result.
 * Returns an empty string if the sequence contains non-ATCG characters or is empty.
 */
export function reverseComplement(seq: string): string {
  if (!seq) return '';

  let comp = '';
  for (let i = 0; i < seq.length; i++) {
    const complementChar = COMPLEMENT_MAP[seq[i]];
    if (!complementChar) {
      return '';
    }
    comp += complementChar;
  }

  return comp.split('').reverse().join('');
}

/**
 * Translates a DNA sequence into an amino acid sequence using the standard genetic code (frame 0).
 * Stop codons (TAA, TAG, TGA) translate to '*'.
 * Returns an empty string if the sequence contains non-ATCG characters or is empty.
 */
export function translate(seq: string): string {
  if (!seq) return '';
  const upper = seq.toUpperCase();

  // Validate non-ATCG characters
  if (!/^[ATCG]+$/.test(upper)) {
    return '';
  }

  let peptide = '';
  for (let i = 0; i + 2 < upper.length; i += 3) {
    const codon = upper.slice(i, i + 3);
    const aa = CODON_TABLE[codon];
    if (aa !== undefined) {
      peptide += aa;
    } else {
      return '';
    }
  }

  return peptide;
}
