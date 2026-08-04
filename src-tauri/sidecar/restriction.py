# sidecar/restriction.py
from typing import List, Dict, Any, Tuple

# Common restriction enzymes database
# Format: enzyme_name: (recognition_site, cut_offset_from_5_prime)
RESTRICTION_ENZYMES: Dict[str, Tuple[str, int]] = {
    "EcoRI": ("GAATTC", 1),
    "BamHI": ("GGATCC", 1),
    "HindIII": ("AAGCTT", 1),
    "XhoI": ("CTCGAG", 1),
    "NotI": ("GCGGCCGC", 2),
    "PstI": ("CTGCAG", 5),
    "XbaI": ("TCTAGA", 1),
    "SpeI": ("ACTAGT", 1),
    "NdeI": ("CATATG", 2),
    "SacI": ("GAGCTC", 5),
    "BglII": ("AGATCT", 1),
    "SalI": ("GTCGAC", 1),
    "EcoRV": ("GATATC", 3),
    "SmaI": ("CCCGGG", 3),
    "KpnI": ("GGTACC", 5),
}

def find_cuts(sequence: str, topology: str, selected_enzymes: List[str]) -> List[Dict[str, Any]]:
    """
    Find cut sites and calculate resulting fragment lengths.
    """
    seq_upper = sequence.upper()
    seq_len = len(seq_upper)
    if seq_len == 0:
        return []

    is_circular = topology.lower() == "circular"
    all_cuts: List[Dict[str, Any]] = []

    for name in selected_enzymes:
        if name not in RESTRICTION_ENZYMES:
            continue
        site, offset = RESTRICTION_ENZYMES[name]
        site_len = len(site)

        # Handle circular wrap-around
        search_seq = seq_upper + (seq_upper[: site_len - 1] if is_circular else "")

        start_idx = 0
        while True:
            idx = search_seq.find(site, start_idx)
            if idx == -1:
                break

            # Check if this match is within bounds of original sequence or valid circular wrap
            if not is_circular and idx >= seq_len:
                break

            cut_position = ((idx + offset) % seq_len)
            if cut_position == 0:
                cut_position = seq_len

            all_cuts.append({
                "enzyme": name,
                "site": site,
                "position": cut_position,
                "match_index": idx,
            })

            start_idx = idx + 1

    # Sort cut sites by position
    all_cuts.sort(key=lambda c: c["position"])

    # Calculate fragment lengths
    if not all_cuts:
        return []

    num_cuts = len(all_cuts)
    for i in range(num_cuts):
        current_pos = all_cuts[i]["position"]

        if i < num_cuts - 1:
            next_pos = all_cuts[i + 1]["position"]
            frag_len = next_pos - current_pos
        else:
            if is_circular:
                first_pos = all_cuts[0]["position"]
                frag_len = (seq_len - current_pos) + first_pos
            else:
                frag_len = seq_len - current_pos

        all_cuts[i]["fragment_length"] = frag_len

    return all_cuts
