# sidecar/auto_annotate.py
from typing import Dict, Any, List
try:
    from .annotation_db import FEATURE_DATABASE
except ImportError:
    from annotation_db import FEATURE_DATABASE

def reverse_complement(seq: str) -> str:
    comp = str.maketrans("ATGCUNatgcun", "TACGANtacgan")
    return seq.translate(comp)[::-1]

def auto_annotate(sequence: str, min_identity: float = 90.0) -> Dict[str, Any]:
    seq = sequence.strip().upper()
    seq_len = len(seq)
    if seq_len == 0:
        return {"ok": True, "hits": [], "count": 0}

    hits: List[Dict[str, Any]] = []

    for feat in FEATURE_DATABASE:
        feat_seq = feat["sequence"].upper()
        feat_len = len(feat_seq)
        if feat_len > seq_len:
            continue

        # Forward strand search
        start_idx = 0
        while True:
            pos = seq.find(feat_seq, start_idx)
            if pos == -1:
                break
            hits.append({
                "id": f"auto-{len(hits) + 1}",
                "name": feat["name"],
                "type": feat["type"],
                "start": pos + 1,
                "end": pos + feat_len,
                "strand": "+",
                "color": feat["color"],
                "notes": feat["notes"],
                "match_pct": 100.0,
            })
            start_idx = pos + 1

        # Reverse strand search
        feat_rc = reverse_complement(feat_seq)
        start_idx = 0
        while True:
            pos = seq.find(feat_rc, start_idx)
            if pos == -1:
                break
            hits.append({
                "id": f"auto-{len(hits) + 1}",
                "name": feat["name"],
                "type": feat["type"],
                "start": pos + 1,
                "end": pos + feat_len,
                "strand": "-",
                "color": feat["color"],
                "notes": feat["notes"],
                "match_pct": 100.0,
            })
            start_idx = pos + 1

    return {
        "ok": True,
        "hits": hits,
        "count": len(hits),
    }
