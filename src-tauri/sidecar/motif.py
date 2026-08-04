# sidecar/motif.py
import re
from typing import Dict, Any, List

IUPAC_MAP = {
    "A": "A",
    "T": "T",
    "G": "G",
    "C": "C",
    "U": "U",
    "R": "[AG]",
    "Y": "[CT]",
    "S": "[GC]",
    "W": "[AT]",
    "K": "[GT]",
    "M": "[AC]",
    "B": "[CGT]",
    "D": "[AGT]",
    "H": "[ACT]",
    "V": "[ACG]",
    "N": "[ATGC]",
}

def iupac_to_regex(pattern: str) -> str:
    res = []
    for char in pattern.upper():
        res.append(IUPAC_MAP.get(char, char))
    return "".join(res)

def reverse_complement(seq: str) -> str:
    comp = str.maketrans("ATGCUNatgcun", "TACGANtacgan")
    return seq.translate(comp)[::-1]

def search_motif(sequence: str, pattern: str, is_regex: bool = False) -> Dict[str, Any]:
    seq = sequence.strip().upper()
    pat = pattern.strip()

    if not seq or not pat:
        return {"ok": True, "hits": [], "count": 0, "pattern": pat}

    if is_regex:
        regex_str = pat
    else:
        regex_str = iupac_to_regex(pat)

    try:
        regex = re.compile(regex_str, re.IGNORECASE)
    except re.error as err:
        return {"ok": False, "error": f"Invalid regex pattern: {err}"}

    hits: List[Dict[str, Any]] = []

    # Forward strand
    for match in regex.finditer(seq):
        hits.append({
            "id": f"hit-fwd-{len(hits) + 1}",
            "start": match.start() + 1,
            "end": match.end(),
            "strand": "+",
            "matched_sequence": match.group(0),
        })

    # Reverse strand
    seq_rc = reverse_complement(seq)
    seq_len = len(seq)
    for match in regex.finditer(seq_rc):
        # Map reverse complement match coordinates back to original strand
        rc_start = match.start()
        rc_end = match.end()
        orig_start = seq_len - rc_end + 1
        orig_end = seq_len - rc_start

        hits.append({
            "id": f"hit-rev-{len(hits) + 1}",
            "start": orig_start,
            "end": orig_end,
            "strand": "-",
            "matched_sequence": reverse_complement(match.group(0)),
        })

    # Sort hits by start coordinate
    hits.sort(key=lambda h: h["start"])

    return {
        "ok": True,
        "hits": hits,
        "count": len(hits),
        "pattern": pat,
        "regex_used": regex_str,
    }
