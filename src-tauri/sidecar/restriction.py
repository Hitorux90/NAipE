# sidecar/restriction.py
from typing import List, Dict, Any, Tuple

# Common restriction enzymes database (fallback)
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


def get_all_enzymes_catalog() -> Dict[str, Dict[str, Any]]:
    """
    Returns full catalog of available restriction enzymes from Biopython (1000+ enzymes).
    Raises ImportError if Biopython is not available in the sidecar Python environment.
    """
    try:
        from Bio.Restriction import AllEnzymes, Restriction
    except ImportError as err:
        raise ImportError(
            "Biopython is missing from sidecar Python — run: <python> -m pip install -r src-tauri/sidecar/requirements.txt"
        ) from err

    catalog = {}
    for enz_name in AllEnzymes:
        name_str = str(enz_name)
        enz = getattr(Restriction, name_str, None)
        if enz and hasattr(enz, "site") and enz.site:
            site_str = str(enz.site).upper()
            offset = getattr(enz, "fst5", 1)
            if offset is None:
                offset = 1
            catalog[name_str] = {
                "name": name_str,
                "site": site_str,
                "cut_offset": int(offset),
                "is_blunt": bool(getattr(enz, "is_blunt", lambda: False)()),
            }

    # Ensure standard fallback enzymes are always present in catalog
    for name, (site, offset) in RESTRICTION_ENZYMES.items():
        if name not in catalog:
            catalog[name] = {
                "name": name,
                "site": site,
                "cut_offset": offset,
                "is_blunt": False,
            }
    return catalog


def _get_enzyme_info(name: str) -> Tuple[str, int]:
    """Retrieve recognition site and offset for an enzyme name."""
    catalog = get_all_enzymes_catalog()
    if name in catalog:
        return catalog[name]["site"], catalog[name]["cut_offset"]
    if name in RESTRICTION_ENZYMES:
        return RESTRICTION_ENZYMES[name]
    return ("", 1)


def find_cuts(
    sequence: str,
    topology: str,
    selected_enzymes: List[str],
    mode: str = "single",
) -> List[Dict[str, Any]]:
    """
    Find cut sites and calculate resulting fragment lengths.
    Modes:
      - "single": Calculates per-enzyme isolated fragments (for single-enzyme ground-truth tests).
      - "combined": Calculates physical multi-enzyme digest fragments when all selected enzymes cut together.
    """
    seq_upper = sequence.upper()
    seq_len = len(seq_upper)
    if seq_len == 0 or not selected_enzymes:
        return []

    is_circular = topology.lower() == "circular"

    if mode == "combined":
        return _find_cuts_combined(seq_upper, seq_len, is_circular, selected_enzymes)
    else:
        return _find_cuts_single(seq_upper, seq_len, is_circular, selected_enzymes)


def _find_cuts_combined(
    seq_upper: str,
    seq_len: int,
    is_circular: bool,
    selected_enzymes: List[str],
) -> List[Dict[str, Any]]:
    """Combined digest: all selected enzymes cut sequence simultaneously in one tube."""
    all_cuts: List[Dict[str, Any]] = []

    for name in selected_enzymes:
        site, offset = _get_enzyme_info(name)
        if not site:
            continue
        site_len = len(site)
        search_seq = seq_upper + (seq_upper[: site_len - 1] if is_circular else "")

        start_idx = 0
        while True:
            idx = search_seq.find(site, start_idx)
            if idx == -1:
                break
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

    if not all_cuts:
        return []

    # Sort all cut sites globally by position
    all_cuts.sort(key=lambda c: c["position"])
    num_cuts = len(all_cuts)

    if is_circular:
        for i in range(num_cuts):
            cur_pos = all_cuts[i]["position"]
            if i < num_cuts - 1:
                next_pos = all_cuts[i + 1]["position"]
                frag_len = next_pos - cur_pos
            else:
                first_pos = all_cuts[0]["position"]
                frag_len = (seq_len - cur_pos) + first_pos
            all_cuts[i]["fragment_length"] = frag_len
        return all_cuts
    else:
        # Linear sequence: k cuts yield k + 1 fragments
        first_cut = all_cuts[0]
        lead_entry = {
            "enzyme": first_cut["enzyme"],
            "site": first_cut["site"],
            "position": 0,
            "match_index": 0,
            "fragment_length": first_cut["position"],
        }
        for i in range(num_cuts):
            cur_pos = all_cuts[i]["position"]
            if i < num_cuts - 1:
                next_pos = all_cuts[i + 1]["position"]
                frag_len = next_pos - cur_pos
            else:
                frag_len = seq_len - cur_pos
            all_cuts[i]["fragment_length"] = frag_len

        return [lead_entry] + all_cuts


def _find_cuts_single(
    seq_upper: str,
    seq_len: int,
    is_circular: bool,
    selected_enzymes: List[str],
) -> List[Dict[str, Any]]:
    """Single-enzyme isolation digest: each enzyme evaluated independently."""
    all_cuts: List[Dict[str, Any]] = []

    for name in selected_enzymes:
        site, offset = _get_enzyme_info(name)
        if not site:
            continue
        site_len = len(site)
        search_seq = seq_upper + (seq_upper[: site_len - 1] if is_circular else "")

        enzyme_cuts: List[Dict[str, Any]] = []
        start_idx = 0
        while True:
            idx = search_seq.find(site, start_idx)
            if idx == -1:
                break
            if not is_circular and idx >= seq_len:
                break

            cut_position = ((idx + offset) % seq_len)
            if cut_position == 0:
                cut_position = seq_len

            enzyme_cuts.append({
                "enzyme": name,
                "site": site,
                "position": cut_position,
                "match_index": idx,
            })
            start_idx = idx + 1

        if not enzyme_cuts:
            continue

        enzyme_cuts.sort(key=lambda c: c["position"])
        num_cuts = len(enzyme_cuts)

        if is_circular:
            for i in range(num_cuts):
                cur_pos = enzyme_cuts[i]["position"]
                if i < num_cuts - 1:
                    next_pos = enzyme_cuts[i + 1]["position"]
                    frag_len = next_pos - cur_pos
                else:
                    first_pos = enzyme_cuts[0]["position"]
                    frag_len = (seq_len - cur_pos) + first_pos
                enzyme_cuts[i]["fragment_length"] = frag_len
            all_cuts.extend(enzyme_cuts)
        else:
            first_cut = enzyme_cuts[0]
            lead_entry = {
                "enzyme": first_cut["enzyme"],
                "site": first_cut["site"],
                "position": 0,
                "match_index": 0,
                "fragment_length": first_cut["position"],
            }
            for i in range(num_cuts):
                cur_pos = enzyme_cuts[i]["position"]
                if i < num_cuts - 1:
                    next_pos = enzyme_cuts[i + 1]["position"]
                    frag_len = next_pos - cur_pos
                else:
                    frag_len = seq_len - cur_pos
                enzyme_cuts[i]["fragment_length"] = frag_len

            all_cuts.append(lead_entry)
            all_cuts.extend(enzyme_cuts)

    all_cuts.sort(key=lambda c: c["position"])
    return all_cuts
