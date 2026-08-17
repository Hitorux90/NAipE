"""
Ground-truth test for the Restriction Mapping tool (Step 1 of the NAipE
remediation plan).

WHY THIS TEST EXISTS
-------------------
The remediation plan (19_Executive_Report_Remediation_Plan.md) was created
because prior test suites verified *wiring*, not *quality*: every tool passed
its integration test while the underlying biology was wrong. This test is the
honest quality gate for Step 1. It asserts correct restriction-digest biology,
derived from TWO independent sources that do NOT share code with sidecar/restriction.py:

  1. Biopython's `Bio.Restriction` (a completely separate, mature implementation)
     used as an oracle for cut-site recognition and fragment sets.
  2. Hand-computed tiny sequences with fully transparent expected values.

CONVENTION NOTE
---------------
sidecar/restriction.py reports cut `position` for real cut sites as exactly 1 less
than Biopython's reported cut position for the same site (find_cuts cuts at the base
5' of the recognition site start, 1-based).
For linear digests, an entry at position 0 represents the leading fragment
(5' origin to first cut site).
"""
import os
import sys
from collections import Counter, defaultdict

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from sidecar.restriction import find_cuts, RESTRICTION_ENZYMES

Bio = pytest.importorskip("Bio")
from Bio import SeqIO  # noqa: E402
from Bio.Seq import Seq  # noqa: E402
from Bio.Restriction import Restriction as R  # noqa: E402

TEST_DATA = os.path.join(ROOT, "test_data")

# Single-record plasmids we treat as exact ground truth. (PRL-19&18.gb holds
# multiple records and is intentionally excluded to keep expectations exact.)
PLASMID_FILES = [
    "sample.gb",
    "pMG_SP-4_speB.gb",
    "PRL-24.gb",
    "Bif_SP-4.gb",
    "pL41_Trf_SP4.gb",
]


def _load_plasmid(filename):
    path = os.path.join(TEST_DATA, filename)
    rec = SeqIO.read(path, "genbank")
    seq = str(rec.seq)
    topo = "circular" if str(rec.annotations.get("topology", "")).lower() == "circular" else "linear"
    return seq, topo


def _bio_search(seq, topo, enzymes):
    """Biopython cut positions grouped by enzyme -> {enzyme: [position, ...]}."""
    s = Seq(seq)
    linear = topo.lower() != "circular"
    out = {}
    for name in enzymes:
        enz = getattr(R, name, None)
        if enz is None:
            continue
        pos = sorted(enz.search(s, linear=linear))
        if pos:
            out[name] = pos
    return out


def _expected_frag_lengths(positions, seq_len, circular):
    """
    Convention-free fragment-length list from 1-based cleavage positions (base 5' of cut).
    Positions are sorted 1-based integers in the range [1, seq_len].
    """
    pl = sorted(positions)
    if not pl:
        return [seq_len] if seq_len > 0 else []
    if circular:
        frags = []
        n = len(pl)
        for i in range(n):
            cur = pl[i]
            nxt = pl[(i + 1) % n]
            frags.append((seq_len - cur) + nxt if i == n - 1 else nxt - cur)
        return sorted(frags)
    prev = 0
    frags = []
    for p in pl:
        frags.append(p - prev)
        prev = p
    frags.append(seq_len - prev)
    return sorted(frags)


def _compute_bio_combined_expected(seq, topo, enzymes):
    """Compute Biopython combined cut positions (find_cuts convention: bio - 1) and expected fragment lengths."""
    s = Seq(seq)
    seq_len = len(seq)
    is_circular = topo.lower() == "circular"
    linear = not is_circular
    all_bio_positions = set()
    for name in enzymes:
        enz = getattr(R, name, None)
        if enz is not None:
            all_bio_positions.update(enz.search(s, linear=linear))

    if not all_bio_positions:
        return [], [seq_len]

    sorted_bio = sorted(all_bio_positions)
    expected_fc_cut_positions = [p - 1 for p in sorted_bio]
    expected_frags = _expected_frag_lengths(expected_fc_cut_positions, seq_len, is_circular)
    return expected_fc_cut_positions, expected_frags


def _assert_plain_types(cuts):
    """Assert that returned cut entries and fragment lengths are strictly plain Python dict and int."""
    for c in cuts:
        assert type(c) is dict, f"Cut entry must be a plain dict, got {type(c)}"
        assert "fragment_length" in c, "Cut entry missing 'fragment_length'"
        assert type(c["fragment_length"]) is int, (
            f"fragment_length must be a plain int, got {type(c['fragment_length'])}: {c['fragment_length']!r}"
        )


# ---------------------------------------------------------------------------
# 1. RECOGNITION: find_cuts finds every real cut site (position set +1 = Biopython)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename", PLASMID_FILES)
def test_recognition_matches_biopython(filename):
    seq, topo = _load_plasmid(filename)
    enzymes = list(RESTRICTION_ENZYMES.keys())

    all_cuts = find_cuts(seq, topo, enzymes, mode="single")
    _assert_plain_types(all_cuts)

    # Group find_cuts real cut sites (position > 0, excluding pos 0 leading fragment) by enzyme
    fc_by = defaultdict(list)
    for c in all_cuts:
        if c["position"] > 0:
            fc_by[c["enzyme"]].append(c["position"])

    bio = _bio_search(seq, topo, enzymes)

    if not bio:
        pytest.skip(f"{filename}: none of the supported enzymes cut this sequence")

    for name in sorted(bio):
        fc_pos = sorted(set(fc_by.get(name, [])))
        bio_pos = sorted(bio.get(name, []))
        # find_cuts position is exactly Biopython position - 1
        assert bio_pos == [p + 1 for p in fc_pos], (
            f"{filename}: {name} cut positions differ. "
            f"find_cuts={fc_pos} (expected bio-1={[p-1 for p in bio_pos]})"
        )


# ---------------------------------------------------------------------------
# 2. FRAGMENT SETS (Single Mode): single-enzyme fragment lengths match Biopython
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename", PLASMID_FILES)
def test_single_enzyme_fragments_match_biopython(filename):
    seq, topo = _load_plasmid(filename)
    seq_len = len(seq)
    is_circular = topo.lower() == "circular"
    enzymes = list(RESTRICTION_ENZYMES.keys())

    all_cuts = find_cuts(seq, topo, enzymes, mode="single")
    _assert_plain_types(all_cuts)

    fc_by = defaultdict(list)
    for c in all_cuts:
        fc_by[c["enzyme"]].append(c)

    bio = _bio_search(seq, topo, enzymes)

    for name in bio:
        enz_cuts = fc_by.get(name, [])
        positions = [c["position"] for c in enz_cuts]
        fc_frags = [c["fragment_length"] for c in enz_cuts]
        expected_cuts_fc = [p - 1 for p in bio[name]]
        expected_frags = _expected_frag_lengths(expected_cuts_fc, seq_len, is_circular)

        # Multiset comparison using Counter
        assert Counter(fc_frags) == Counter(expected_frags), (
            f"{filename}: {name} fragment length multiset mismatch. "
            f"find_cuts={sorted(fc_frags)} expected={sorted(expected_frags)}"
        )

        # Position structure check:
        # For linear: exactly [0, p1, p2, ...] with no duplicates
        # For circular: exactly [p1, p2, ...] with no duplicates
        if is_circular:
            assert positions == expected_cuts_fc, (
                f"{filename}: {name} circular cut positions mismatch: got {positions}, expected {expected_cuts_fc}"
            )
        else:
            assert positions == [0] + expected_cuts_fc, (
                f"{filename}: {name} linear cut positions mismatch: got {positions}, expected {[0] + expected_cuts_fc}"
            )


# ---------------------------------------------------------------------------
# 3. COMBINED DIGEST ON PLASMIDS: multi-enzyme combined digest matches Biopython
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename", PLASMID_FILES)
def test_combined_fragments_match_biopython(filename):
    seq, topo = _load_plasmid(filename)
    is_circular = topo.lower() == "circular"
    enzymes = list(RESTRICTION_ENZYMES.keys())

    cuts = find_cuts(seq, topo, enzymes, mode="combined")
    _assert_plain_types(cuts)

    expected_cut_pos, expected_frags = _compute_bio_combined_expected(seq, topo, enzymes)

    if not expected_cut_pos:
        pytest.skip(f"{filename}: no enzymes cut this sequence in combined mode")

    actual_positions = [c["position"] for c in cuts]
    actual_frags = [c["fragment_length"] for c in cuts]

    # Multiset comparison of fragment lengths
    assert Counter(actual_frags) == Counter(expected_frags), (
        f"{filename} combined fragment mismatch: got {sorted(actual_frags)}, expected {sorted(expected_frags)}"
    )

    # Position checks (verifying no duplicate positions):
    if is_circular:
        assert actual_positions == expected_cut_pos, (
            f"{filename} circular combined positions mismatch: got {actual_positions}, expected {expected_cut_pos}"
        )
    else:
        assert actual_positions == [0] + expected_cut_pos, (
            f"{filename} linear combined positions mismatch: got {actual_positions}, expected {[0] + expected_cut_pos}"
        )


# ---------------------------------------------------------------------------
# 4. HAND-COMPUTED: linear multi-cut yields [1, 6, 5] at positions [0, 1, 7]
#    GAATTCGAATTC (len 12), EcoRI cuts at 0-based 0, 6 -> cut positions 1 and 7.
# ---------------------------------------------------------------------------
def test_linear_multi_cut_fragments_hand_computed():
    seq = "GAATTCGAATTC"
    for mode in ("single", "combined"):
        cuts = find_cuts(seq, "linear", ["EcoRI"], mode=mode)
        _assert_plain_types(cuts)
        assert len(cuts) == 3, f"Expected 3 fragments for 2 cuts, got {len(cuts)} (mode={mode})"
        positions = [c["position"] for c in cuts]
        frags = [c["fragment_length"] for c in cuts]
        assert positions == [0, 1, 7], f"Expected positions [0, 1, 7], got {positions} (mode={mode})"
        assert frags == [1, 6, 5], f"Expected fragments [1, 6, 5], got {frags} (mode={mode})"


# ---------------------------------------------------------------------------
# 5. HAND-COMPUTED: linear single cut yields [4, 8] at positions [0, 4]
#    AAAGAATTCAAA (len 12), EcoRI cut at pos 4.
# ---------------------------------------------------------------------------
def test_linear_single_cut_yields_two_fragments():
    seq = "AAAGAATTCAAA"
    for mode in ("single", "combined"):
        cuts = find_cuts(seq, "linear", ["EcoRI"], mode=mode)
        _assert_plain_types(cuts)
        assert len(cuts) == 2, f"Expected 2 fragments for single cut, got {len(cuts)} (mode={mode})"
        positions = [c["position"] for c in cuts]
        frags = [c["fragment_length"] for c in cuts]
        assert positions == [0, 4], f"Expected positions [0, 4], got {positions} (mode={mode})"
        assert frags == [4, 8], f"Expected fragments [4, 8], got {frags} (mode={mode})"


# ---------------------------------------------------------------------------
# 6. HAND-COMPUTED: multi-enzyme in SINGLE mode does NOT cross-contaminate
#    GAATTCCCGGATCCAA (len 16): EcoRI@pos1, BamHI@pos9.
#    EcoRI alone -> positions [0, 1], frags [1, 15]
#    BamHI alone -> positions [0, 9], frags [9, 7]
# ---------------------------------------------------------------------------
def test_multienzyme_does_not_cross_contaminate_single_mode():
    seq = "GAATTCCCGGATCCAA"  # 16 bp: EcoRI at 0 (pos 1), BamHI at 8 (pos 9)
    all_cuts = find_cuts(seq, "linear", ["EcoRI", "BamHI"], mode="single")
    _assert_plain_types(all_cuts)

    by = defaultdict(list)
    for c in all_cuts:
        by[c["enzyme"]].append(c)

    eco_cuts = by.get("EcoRI", [])
    bam_cuts = by.get("BamHI", [])

    eco_pos = [c["position"] for c in eco_cuts]
    eco_frags = [c["fragment_length"] for c in eco_cuts]
    assert eco_pos == [0, 1], f"EcoRI positions wrong: got {eco_pos}, expected [0, 1]"
    assert eco_frags == [1, 15], f"EcoRI fragments wrong: got {eco_frags}, expected [1, 15]"

    bam_pos = [c["position"] for c in bam_cuts]
    bam_frags = [c["fragment_length"] for c in bam_cuts]
    assert bam_pos == [0, 9], f"BamHI positions wrong: got {bam_pos}, expected [0, 9]"
    assert bam_frags == [9, 7], f"BamHI fragments wrong: got {bam_frags}, expected [9, 7]"


# ---------------------------------------------------------------------------
# 7. HAND-COMPUTED: multi-enzyme in COMBINED mode yields physical digest
#    GAATTCCCGGATCCAA (len 16): EcoRI@pos1, BamHI@pos9.
#    Combined digest cuts at 1 and 9 -> positions [0, 1, 9], fragments [1, 8, 7]
# ---------------------------------------------------------------------------
def test_multienzyme_combined_mode_digest():
    seq = "GAATTCCCGGATCCAA"
    cuts = find_cuts(seq, "linear", ["EcoRI", "BamHI"], mode="combined")
    _assert_plain_types(cuts)

    positions = [c["position"] for c in cuts]
    frags = [c["fragment_length"] for c in cuts]

    assert positions == [0, 1, 9], f"Combined positions wrong: got {positions}, expected [0, 1, 9]"
    assert frags == [1, 8, 7], f"Combined fragments wrong: got {frags}, expected [1, 8, 7]"


# ---------------------------------------------------------------------------
# 8. HAND-COMPUTED: circular single cut yields ONE full-length fragment [6] at pos [1]
# ---------------------------------------------------------------------------
def test_circular_single_cut_yields_one_full_fragment():
    seq = "GAATTC"  # circular, one EcoRI site at pos 1
    for mode in ("single", "combined"):
        cuts = find_cuts(seq, "circular", ["EcoRI"], mode=mode)
        _assert_plain_types(cuts)
        positions = [c["position"] for c in cuts]
        frags = [c["fragment_length"] for c in cuts]
        assert positions == [1], f"Expected circular position [1], got {positions} (mode={mode})"
        assert frags == [6], f"Expected circular fragment [6], got {frags} (mode={mode})"


# ---------------------------------------------------------------------------
# 9. HAND-COMPUTED: circular multi-cut & multi-enzyme combined digest
# ---------------------------------------------------------------------------
def test_circular_multicut_combined_digest():
    # 16 bp circular with EcoRI at pos 1 and BamHI at pos 9
    # Cuts at 1 and 9: fragment 1->9 is 8 bp, fragment 9->1 (wrapped: 16-9+1) is 8 bp
    seq = "GAATTCCCGGATCCAA"
    cuts = find_cuts(seq, "circular", ["EcoRI", "BamHI"], mode="combined")
    _assert_plain_types(cuts)

    positions = [c["position"] for c in cuts]
    frags = [c["fragment_length"] for c in cuts]

    assert positions == [1, 9], f"Expected circular combined positions [1, 9], got {positions}"
    assert frags == [8, 8], f"Expected circular combined fragments [8, 8], got {frags}"
