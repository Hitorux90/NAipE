# sidecar/primer.py
from typing import Dict, Any

COMPLEMENT_TABLE = str.maketrans("ATCGatcgNn", "TAGCtagcNn")

def reverse_complement(seq: str) -> str:
    return seq.translate(COMPLEMENT_TABLE)[::-1]

def calc_gc(seq: str) -> float:
    if not seq:
        return 0.0
    seq_upper = seq.upper()
    gc_count = sum(1 for char in seq_upper if char in "GC")
    return round((gc_count / len(seq_upper)) * 100.0, 1)

def calc_tm(seq: str) -> float:
    if not seq:
        return 0.0
    seq_upper = seq.upper()
    seq_len = len(seq_upper)
    gc_count = sum(1 for char in seq_upper if char in "GC")
    at_count = sum(1 for char in seq_upper if char in "AT")

    if seq_len < 14:
        tm = (at_count * 2.0) + (gc_count * 4.0)
    else:
        tm = 64.9 + (41.0 * (gc_count - 16.4) / seq_len)
    return round(tm, 1)

def analyze_primer(primer: str) -> Dict[str, Any]:
    clean_primer = primer.strip().upper()
    return {
        "primer": clean_primer,
        "length": len(clean_primer),
        "gc_percent": calc_gc(clean_primer),
        "tm_celsius": calc_tm(clean_primer),
        "reverse_complement": reverse_complement(clean_primer),
    }

def simulate_pcr(template: str, forward_primer: str, reverse_primer: str) -> Dict[str, Any]:
    clean_template = template.strip().upper()
    fwd = forward_primer.strip().upper()
    rev = reverse_primer.strip().upper()

    if not clean_template or not fwd or not rev:
        return {
            "ok": False,
            "error": "Template and both forward/reverse primers are required.",
        }

    rev_comp = reverse_complement(rev)

    fwd_idx = clean_template.find(fwd)
    rev_idx = clean_template.find(rev_comp)

    if fwd_idx == -1:
        return {
            "ok": False,
            "error": f"Forward primer '{fwd}' binding site not found in template sequence.",
        }

    if rev_idx == -1:
        return {
            "ok": False,
            "error": f"Reverse primer '{rev}' (rc: '{rev_comp}') binding site not found in template sequence.",
        }

    if rev_idx + len(rev) <= fwd_idx:
        return {
            "ok": False,
            "error": "Reverse primer binds upstream of forward primer. No PCR product generated.",
        }

    end_idx = rev_idx + len(rev)
    product = clean_template[fwd_idx:end_idx]

    return {
        "ok": True,
        "product": product,
        "length_bp": len(product),
        "fwd_start": fwd_idx + 1,
        "rev_end": end_idx,
        "fwd_tm": calc_tm(fwd),
        "rev_tm": calc_tm(rev),
        "fwd_gc": calc_gc(fwd),
        "rev_gc": calc_gc(rev),
    }
