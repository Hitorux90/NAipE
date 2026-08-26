"""
sidecar/primer.py — Primer Design & Virtual PCR Simulator for NAipE.

Documented Formulas (§3.2.1):
-----------------------------
1. Melting Temperature (Tm):
   - Short primers (len < 14 bp): Wallace Rule
       Tm = 2 * count(A + T) + 4 * count(G + C)
       (rounded to 1 decimal place)
   - Standard primers (len >= 14 bp): Basic Marmur-Doty Formula
       Tm = 64.9 + 41.0 * (count(G + C) - 16.4) / N
       (rounded to 1 decimal place)
   - Empty sequence: Tm = 0.0 °C

2. GC Percentage (GC%):
   - GC% = round(count(G + C) / N * 100.0, 1)
   - Empty sequence: GC% = 0.0%

3. Thermodynamic Comparison Note:
   Basic Marmur-Doty and Wallace formulas provide fast, salt-independent approximations.
   Thermodynamic Nearest-Neighbor methods (SantaLucia 1998 / NEB / IDT) include salt/divalent
   ion corrections and typically differ by ~10–15 °C for 20-mer primers. This difference is
   expected by design. Nearest-Neighbor calculations are documented for future implementation.

4. Degenerate Bases & IUPAC:
   Reverse complement translates standard degenerate bases (e.g. N -> N).
   Exact search matches literal bases; degenerate / partial-homology matching is not
   performed under exact search.

5. PCR Scanning & Facing Rule (Unrolled Coordinates):
   Template search scans for binding sites with +1 overlapping stepping.
   Both linear and circular topologies are supported (defaulting to 'linear').
   Facing orientation is evaluated on unrolled coordinates to correctly handle circular
   origin wrap-around without false rejections or phantom double-counts.
"""

from typing import Dict, Any, List

COMPLEMENT_TABLE = str.maketrans("ACGTURYSWKMBDHVNacgturyswkmbdhvn", "TGCAAYRSWMKVHDBNtgcaayrswmkvhdbn")


def reverse_complement(seq: str) -> str:
    """Return uppercase reverse complement of a DNA sequence."""
    return seq.upper().translate(COMPLEMENT_TABLE)[::-1]


def calc_gc(seq: str) -> float:
    """Calculate GC percentage rounded to 1 decimal place."""
    if not seq:
        return 0.0
    seq_upper = seq.upper()
    gc_count = sum(1 for char in seq_upper if char in "GC")
    return round((gc_count / len(seq_upper)) * 100.0, 1)


def calc_tm(seq: str) -> float:
    """Calculate Tm (°C) using Wallace (<14 bp) or Marmur-Doty (>=14 bp), rounded to 1 dp."""
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
    """Analyze a single primer and return length, GC%, Tm, and reverse complement."""
    clean_primer = primer.strip().upper()
    return {
        "primer": clean_primer,
        "length": len(clean_primer),
        "gc_percent": calc_gc(clean_primer),
        "tm_celsius": calc_tm(clean_primer),
        "reverse_complement": reverse_complement(clean_primer),
    }


def find_all_sites(seq: str, sub: str) -> List[int]:
    """Find all 0-based start indices of substring with +1 overlap stepping."""
    if not seq or not sub:
        return []
    sites: List[int] = []
    start = 0
    while True:
        idx = seq.find(sub, start)
        if idx == -1:
            break
        sites.append(idx)
        start = idx + 1
    return sites


def simulate_pcr(
    template: str,
    forward_primer: str,
    reverse_primer: str,
    topology: str = "linear",
) -> Dict[str, Any]:
    """
    Simulate virtual PCR on a linear or circular DNA template.

    Scans binding sites with +1 overlap stepping, validates specificity (rejecting
    multi-site or zero-site primers), enforces facing orientation on unrolled coordinates,
    and supports circular origin-wrapping products.
    """
    clean_template = template.strip().upper()
    fwd = forward_primer.strip().upper()
    rev = reverse_primer.strip().upper()
    topo = topology.strip().lower() if topology else "linear"

    if not clean_template or not fwd or not rev:
        return {
            "ok": False,
            "error": "Template and both forward/reverse primers are required.",
            "fwd_sites": [],
            "rev_sites": [],
            "warnings": [],
        }

    template_len = len(clean_template)
    rc_rev = reverse_complement(rev)
    warnings: List[str] = []

    # Search space for linear vs circular
    if topo == "circular":
        overlap = max(len(fwd), len(rev)) - 1
        search_seq = clean_template + clean_template[:overlap] if overlap > 0 else clean_template
    else:
        search_seq = clean_template

    # Detect binding sites (count only unique starts < template_len to avoid double-counting)
    fwd_sites = [i for i in find_all_sites(search_seq, fwd) if i < template_len]
    rev_sites = [i for i in find_all_sites(search_seq, rc_rev) if i < template_len]

    # Specificity & presence validations
    if len(fwd_sites) == 0:
        return {
            "ok": False,
            "error": f"Forward primer '{fwd}' binding site not found in template sequence.",
            "fwd_sites": [],
            "rev_sites": rev_sites,
            "warnings": warnings,
        }

    if len(rev_sites) == 0:
        return {
            "ok": False,
            "error": f"Reverse primer '{rev}' (rc: '{rc_rev}') binding site not found in template sequence.",
            "fwd_sites": fwd_sites,
            "rev_sites": [],
            "warnings": warnings,
        }

    if len(fwd_sites) > 1:
        return {
            "ok": False,
            "error": f"Forward primer '{fwd}' is non-specific: {len(fwd_sites)} binding sites found at indices {fwd_sites}.",
            "fwd_sites": fwd_sites,
            "rev_sites": rev_sites,
            "warnings": warnings,
        }

    if len(rev_sites) > 1:
        return {
            "ok": False,
            "error": f"Reverse primer '{rev}' is non-specific: {len(rev_sites)} binding sites found at indices {rev_sites}.",
            "fwd_sites": fwd_sites,
            "rev_sites": rev_sites,
            "warnings": warnings,
        }

    fi = fwd_sites[0]
    ri = rev_sites[0]

    # Facing orientation & amplicon extraction on unrolled coordinate
    if topo == "linear":
        if ri < fi or (ri + len(rev)) <= fi:
            return {
                "ok": False,
                "error": f"Reverse primer binds upstream of forward primer (fwd start index {fi}, rev-comp end index {ri + len(rev)}). Primers do not face each other / no product generated on linear template.",
                "fwd_sites": fwd_sites,
                "rev_sites": rev_sites,
                "warnings": warnings,
            }
        end_idx = ri + len(rev)
        product = clean_template[fi:end_idx]
        fwd_start = fi + 1
        rev_end = end_idx

    elif topo == "circular":
        if ri >= fi:
            rev_end_unrolled = ri + len(rev)
            if rev_end_unrolled - fi > template_len or rev_end_unrolled <= fi:
                return {
                    "ok": False,
                    "error": "Primers do not face each other (circular). No PCR product generated.",
                    "fwd_sites": fwd_sites,
                    "rev_sites": rev_sites,
                    "warnings": warnings,
                }
            product = clean_template[fi:rev_end_unrolled]
            fwd_start = fi + 1
            rev_end = rev_end_unrolled if rev_end_unrolled <= template_len else rev_end_unrolled - template_len
        else:
            # Wrap around origin
            rev_end_unrolled = ri + template_len + len(rev)
            if rev_end_unrolled - fi > template_len or rev_end_unrolled <= fi:
                return {
                    "ok": False,
                    "error": "Primers do not face each other (circular). No PCR product generated.",
                    "fwd_sites": fwd_sites,
                    "rev_sites": rev_sites,
                    "warnings": warnings,
                }
            product = clean_template[fi:template_len] + clean_template[0 : ri + len(rev)]
            fwd_start = fi + 1
            rev_end = ri + len(rev)
    else:
        return {
            "ok": False,
            "error": f"Unknown topology '{topology}'. Expected 'linear' or 'circular'.",
            "fwd_sites": fwd_sites,
            "rev_sites": rev_sites,
            "warnings": warnings,
        }

    return {
        "ok": True,
        "product": product,
        "length_bp": len(product),
        "fwd_start": fwd_start,
        "rev_end": rev_end,
        "fwd_tm": calc_tm(fwd),
        "rev_tm": calc_tm(rev),
        "fwd_gc": calc_gc(fwd),
        "rev_gc": calc_gc(rev),
        "fwd_sites": fwd_sites,
        "rev_sites": rev_sites,
        "warnings": warnings,
    }
