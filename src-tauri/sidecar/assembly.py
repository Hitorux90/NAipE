# sidecar/assembly.py
from typing import Dict, Any, List

def find_overlap(seq1: str, seq2: str, min_overlap: int = 10, max_overlap: int = 40) -> int:
    s1 = seq1.upper()
    s2 = seq2.upper()
    best = 0
    for k in range(min_overlap, min(len(s1), len(s2), max_overlap) + 1):
        if s1[-k:] == s2[:k]:
            best = k
    return best

def simulate_gibson_assembly(parts: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not parts:
        return {"ok": False, "error": "No parts provided for Gibson Assembly."}

    if len(parts) == 1:
        part = parts[0]
        return {
            "ok": True,
            "assembled_sequence": part.get("sequence", ""),
            "length_bp": len(part.get("sequence", "")),
            "topology": "circular",
            "annotations": part.get("annotations", []),
            "junctions": [],
            "method": "gibson",
        }

    assembled = parts[0].get("sequence", "").upper()
    annotations = list(parts[0].get("annotations", []))
    junctions = []

    for idx in range(1, len(parts)):
        curr_part = parts[idx]
        curr_seq = curr_part.get("sequence", "").upper()
        overlap_len = find_overlap(assembled, curr_seq)

        if overlap_len > 0:
            junctions.append({
                "from_part": parts[idx - 1].get("name", f"Part {idx}"),
                "to_part": curr_part.get("name", f"Part {idx + 1}"),
                "overlap_bp": overlap_len,
                "sequence": curr_seq[:overlap_len],
            })
            # Append non-overlapping part
            offset = len(assembled) - overlap_len
            assembled = assembled + curr_seq[overlap_len:]
        else:
            # Direct fusion fallback
            offset = len(assembled)
            assembled = assembled + curr_seq

        # Shift annotations for current part
        for ann in curr_part.get("annotations", []):
            annotations.append({
                "id": ann.get("id", f"ann-{idx}"),
                "name": ann.get("name", "feature"),
                "type": ann.get("type", "misc_feature"),
                "start": ann.get("start", 1) + offset,
                "end": ann.get("end", len(curr_seq)) + offset,
                "strand": ann.get("strand", "+"),
                "color": ann.get("color", "#3B82F6"),
                "notes": ann.get("notes", ""),
            })

    # Check circularization overlap (last part back to first part)
    circ_overlap = find_overlap(assembled, parts[0].get("sequence", "").upper())
    if circ_overlap > 0:
        assembled = assembled[:-circ_overlap]
        topology = "circular"
    else:
        topology = "circular"  # Default plasmid topology

    return {
        "ok": True,
        "assembled_sequence": assembled,
        "length_bp": len(assembled),
        "topology": topology,
        "annotations": annotations,
        "junctions": junctions,
        "method": "gibson",
    }

def simulate_assembly(parts: List[Dict[str, Any]], method: str = "gibson") -> Dict[str, Any]:
    if not parts:
        return {"ok": False, "error": "At least 1 sequence fragment is required for virtual assembly."}

    clean_method = method.lower()
    return simulate_gibson_assembly(parts)
