# sidecar/properties.py
from typing import Dict, Any, List

def compute_properties(sequence: str, window_size: int = 50, step: int = 10) -> Dict[str, Any]:
    seq = sequence.strip().upper()
    seq_len = len(seq)

    if seq_len == 0:
        return {
            "length_bp": 0,
            "overall_gc": 0.0,
            "overall_tm": 0.0,
            "mw_daltons": 0.0,
            "positions": [],
            "gc_profile": [],
            "tm_profile": [],
            "gc_skew": [],
        }

    # Base counts
    count_a = seq.count("A")
    count_t = seq.count("T")
    count_c = seq.count("C")
    count_g = seq.count("G")
    count_gc = count_g + count_c

    overall_gc = round((count_gc / seq_len) * 100.0, 1)

    if seq_len < 14:
        overall_tm = float((count_a + count_t) * 2 + count_gc * 4)
    else:
        overall_tm = round(64.9 + (41.0 * (count_gc - 16.4) / seq_len), 1)

    # MW estimate in Daltons (g/mol) for single stranded, + (double stranded = ~2x)
    mw_ds_daltons = round(((count_a * 313.21) + (count_t * 304.2) + (count_c * 289.18) + (count_g * 329.21) - 61.96) * 2.0, 2)

    # Sliding window
    win = max(10, min(window_size, seq_len))
    st = max(1, step)

    positions: List[int] = []
    gc_profile: List[float] = []
    tm_profile: List[float] = []
    gc_skew: List[float] = []

    for i in range(0, seq_len - win + 1, st):
        sub = seq[i : i + win]
        sub_gc = sum(1 for char in sub if char in "GC")
        sub_g = sub.count("G")
        sub_c = sub.count("C")

        pos = i + (win // 2) + 1
        positions.append(pos)

        gc_pct = round((sub_gc / win) * 100.0, 1)
        gc_profile.append(gc_pct)

        if win < 14:
            tm_val = float(sum(1 for c in sub if c in "AT") * 2 + sub_gc * 4)
        else:
            tm_val = round(64.9 + (41.0 * (sub_gc - 16.4) / win), 1)
        tm_profile.append(tm_val)

        if sub_g + sub_c > 0:
            skew_val = round((sub_g - sub_c) / (sub_g + sub_c), 3)
        else:
            skew_val = 0.0
        gc_skew.append(skew_val)

    return {
        "length_bp": seq_len,
        "overall_gc": overall_gc,
        "overall_tm": overall_tm,
        "mw_daltons": mw_ds_daltons,
        "mw_kda": round(mw_ds_daltons / 1000.0, 1),
        "window_size": win,
        "step": st,
        "positions": positions,
        "gc_profile": gc_profile,
        "tm_profile": tm_profile,
        "gc_skew": gc_skew,
    }
