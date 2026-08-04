# sidecar/orf.py
from typing import Dict, Any, List

CODON_TABLE = {
    'ATA':'I', 'ATC':'I', 'ATT':'I', 'ATG':'M',
    'ACA':'T', 'ACC':'T', 'ACG':'T', 'ACT':'T',
    'AAC':'N', 'AAT':'N', 'AAA':'K', 'AAG':'K',
    'AGC':'S', 'AGT':'S', 'AGA':'R', 'AGG':'R',
    'CTA':'L', 'CTC':'L', 'CTG':'L', 'CTT':'L',
    'CCA':'P', 'CCC':'P', 'CCG':'P', 'CCT':'P',
    'CAC':'H', 'CAT':'H', 'CAA':'Q', 'CAG':'Q',
    'CGA':'R', 'CGC':'R', 'CGT':'R', 'CGG':'R',
    'GTA':'V', 'GTC':'V', 'GTG':'V', 'GTT':'V',
    'GCA':'A', 'GCC':'A', 'GCG':'A', 'GCT':'A',
    'GAC':'D', 'GAT':'D', 'GAA':'E', 'GAG':'E',
    'GGA':'G', 'GGC':'G', 'GGG':'G', 'GGT':'G',
    'TCA':'S', 'TCC':'S', 'TCG':'S', 'TCT':'S',
    'TTC':'F', 'TTT':'F', 'TTA':'L', 'TTG':'L',
    'TAC':'Y', 'TAT':'Y', 'TAA':'*', 'TAG':'*',
    'TGC':'C', 'TGT':'C', 'TGA':'*', 'TGG':'W',
}

STOP_CODONS = {"TAA", "TAG", "TGA"}
START_CODONS = {"ATG"}
COMPLEMENT_TABLE = str.maketrans("ATCGatcgNn", "TAGCtagcNn")

def reverse_complement(seq: str) -> str:
    return seq.translate(COMPLEMENT_TABLE)[::-1]

def translate_dna(dna: str) -> str:
    dna_upper = dna.upper()
    amino_acids = []
    for i in range(0, len(dna_upper) - 2, 3):
        codon = dna_upper[i:i+3]
        aa = CODON_TABLE.get(codon, '?')
        if aa == '*':
            break
        amino_acids.append(aa)
    return "".join(amino_acids)

def find_orfs(sequence: str, topology: str = "linear", min_length_aa: int = 30) -> Dict[str, Any]:
    seq = sequence.strip().upper()
    seq_len = len(seq)
    if seq_len < 9:
        return {"orfs": [], "count": 0}

    orfs: List[Dict[str, Any]] = []

    # Forward strand frames (+1, +2, +3)
    for offset in range(3):
        i = offset
        while i <= seq_len - 3:
            codon = seq[i:i+3]
            if codon in START_CODONS:
                start_idx = i
                j = i + 3
                found_stop = False
                while j <= seq_len - 3:
                    stop_candidate = seq[j:j+3]
                    if stop_candidate in STOP_CODONS:
                        found_stop = True
                        break
                    j += 3
                if found_stop:
                    orf_dna = seq[start_idx:j]
                    aa_len = len(orf_dna) // 3
                    if aa_len >= min_length_aa:
                        orfs.append({
                            "id": f"orf-fwd-{start_idx+1}-{j+3}",
                            "name": f"ORF (+{offset+1}) {aa_len}aa",
                            "strand": "+",
                            "frame": f"+{offset+1}",
                            "start": start_idx + 1,
                            "end": j + 3,
                            "length_bp": j + 3 - start_idx,
                            "length_aa": aa_len,
                            "translation": translate_dna(orf_dna),
                        })
                i += 3
            else:
                i += 3

    # Reverse strand frames (-1, -2, -3)
    rc_seq = reverse_complement(seq)
    for offset in range(3):
        i = offset
        while i <= seq_len - 3:
            codon = rc_seq[i:i+3]
            if codon in START_CODONS:
                start_idx = i
                j = i + 3
                found_stop = False
                while j <= seq_len - 3:
                    stop_candidate = rc_seq[j:j+3]
                    if stop_candidate in STOP_CODONS:
                        found_stop = True
                        break
                    j += 3
                if found_stop:
                    orf_dna = rc_seq[start_idx:j]
                    aa_len = len(orf_dna) // 3
                    if aa_len >= min_length_aa:
                        fwd_start = seq_len - (j + 3) + 1
                        fwd_end = seq_len - start_idx
                        orfs.append({
                            "id": f"orf-rev-{fwd_start}-{fwd_end}",
                            "name": f"ORF (-{offset+1}) {aa_len}aa",
                            "strand": "-",
                            "frame": f"-{offset+1}",
                            "start": fwd_start,
                            "end": fwd_end,
                            "length_bp": fwd_end - fwd_start + 1,
                            "length_aa": aa_len,
                            "translation": translate_dna(orf_dna),
                        })
                i += 3
            else:
                i += 3

    # Sort ORFs by length descending
    orfs.sort(key=lambda o: o["length_aa"], reverse=True)

    return {
        "orfs": orfs,
        "count": len(orfs),
        "min_length_aa": min_length_aa,
    }
