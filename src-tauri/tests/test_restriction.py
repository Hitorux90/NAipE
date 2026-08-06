"""
Ground-truth test for the Restriction Mapping tool (Step 1 of the NAipE
remediation plan).

WHY THIS TEST EXISTS
-------------------
The remediation plan (19_Executive_Report_Remediation_Plan.md) was created
because the existing suites verified *wiring*, not *quality*: every tool passed
its integration test while the underlying biology was wrong. This test is the
quality gate for Step 1. It asserts correct restriction-digest biology, derived
from TWO independent sources that do NOT share code with sidecar/restriction.py:

  1. Biopython's `Bio.Restriction` (a completely separate, mature implementation)
     used as an oracle for cut-site recognition and single-enzyme fragment sets.
  2. Hand-computed tiny sequences with fully transparent expected values.

CONVENTION NOTE
---------------
sidecar/restriction.py reports a cut `position` that is exactly 1 less than
Biopython's reported cut position for the same site (find_cuts cuts at the base
5' of the recognition site start, 1-based). Because fragment *lengths* are
convention-independent, fragment-length multisets are the robust oracle; cut
*positions* are checked via the uniform +1 mapping.

EXPECTED STATE
--------------
This test is RED on the current find_cuts() implementation. That is intended:
it documents the correct behaviour the Step-1 fix must achieve. When it goes
green, Step 1's enzyme math is validated against ground truth.
"""
import os
import sys
from collections import defaultdict

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


def _fc_by_enzyme(seq, topo, enzymes):
    """find_cuts grouped by enzyme -> {enzyme: [position, ...]}."""
    cuts = find_cuts(seq, topo, enzymes)
    by = defaultdict(list)
    for c in cuts:
        by[c["enzyme"]].append(c["position"])
    return by


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
    """Convention-free fragment-length multiset for a single enzyme's cuts."""
    pl = sorted(positions)
    if not pl:
        return []
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


def _fc_frag_lengths(cuts):
    return sorted(c["fragment_length"] for c in cuts)


# ---------------------------------------------------------------------------
# 1. RECOGNITION: find_cuts finds every real cut site (position set +1 = Biopython)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename", PLASMID_FILES)
def test_recognition_matches_biopython(filename):
    seq, topo = _load_plasmid(filename)
    enzymes = list(RESTRICTION_ENZYMES.keys())

    fc = _fc_by_enzyme(seq, topo, enzymes)
    bio = _bio_search(seq, topo, enzymes)

    if not bio:
        pytest.skip(f"{filename}: none of the supported enzymes cut this sequence "
                    f"(no ground-truth sites to compare against)")

    # Only compare enzymes where Biopython actually found a cut site.
    for name in sorted(bio):
        fc_pos = sorted(fc.get(name, []))
        bio_pos = sorted(bio.get(name, []))
        # find_cuts position is exactly Biopython position - 1
        assert bio_pos == [p + 1 for p in fc_pos], (
            f"{filename}: {name} cut positions differ. "
            f"find_cuts={fc_pos} (expected bio-1={[p-1 for p in bio_pos]})"
        )


# ---------------------------------------------------------------------------
# 2. FRAGMENT SETS: single-enzyme fragment lengths match Biopython oracle
#    (catches missing end-fragments on linear digests and cross-enzyme mixing)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename", PLASMID_FILES)
def test_single_enzyme_fragments_match_biopython(filename):
    seq, topo = _load_plasmid(filename)
    seq_len = len(seq)
    enzymes = list(RESTRICTION_ENZYMES.keys())

    # Run find_cuts once for all enzymes, then look at each enzyme in isolation.
    all_cuts = find_cuts(seq, topo, enzymes)
    fc_by = defaultdict(list)
    for c in all_cuts:
        fc_by[c["enzyme"]].append(c)

    bio = _bio_search(seq, topo, enzymes)

    for name in bio:  # only enzymes Biopython actually cuts
        fc_frags = _fc_frag_lengths(fc_by.get(name, []))
        expected = _expected_frag_lengths(bio[name], seq_len, topo == "circular")
        assert fc_frags == expected, (
            f"{filename}: {name} fragment lengths wrong. "
            f"find_cuts={fc_frags} expected={expected}"
        )


# ---------------------------------------------------------------------------
# 3. HAND-COMPUTED: linear multi-cut yields correct fragment list (incl. ends)
#    GAATTCGAATTC, EcoRI at 0-based 0 and 6 -> cut positions 1 and 7 (find_cuts conv).
#    Linear fragments: [1, 6, 5]  (NOT [6, 5] with the leading fragment dropped).
# ---------------------------------------------------------------------------
def test_linear_multi_cut_fragments_hand_computed():
    seq = "GAATTCGAATTC"
    cuts = find_cuts(seq, "linear", ["EcoRI"])
    frags = _fc_frag_lengths(cuts)
    assert frags == [1, 6, 5], f"expected [1,6,5] for linear GAATTCGAATTC EcoRI, got {frags}"


# ---------------------------------------------------------------------------
# 4. HAND-COMPUTED: a single cut on a LINEAR molecule yields TWO fragments
#    (the 5'->cut fragment and the cut->3' fragment). find_cuts currently
#    returns only one fragment for single-cut linear digests.
# ---------------------------------------------------------------------------
def test_linear_single_cut_yields_two_fragments():
    seq = "AAAGAATTCAAA"  # one EcoRI site at 0-based 3 -> cut position 4
    cuts = find_cuts(seq, "linear", ["EcoRI"])
    frags = _fc_frag_lengths(cuts)
    # cut at pos 4 of length-12 linear: fragments [4, 8]
    assert frags == [4, 8], f"linear single cut must give 2 fragments [4,8], got {frags}"


# ---------------------------------------------------------------------------
# 5. HAND-COMPUTED: multi-enzyme fragment must NOT cross-contaminate enzymes
#    Each enzyme's reported fragment must equal its own single-enzyme fragment
#    set, not the gap to the nearest cut of a different enzyme.
#    "GAATTCCC GGATCC AA" (len 16): EcoRI@pos1, BamHI@pos9.
#    EcoRI alone (linear) -> [1, 15]; BamHI alone -> [9, 7].
# ---------------------------------------------------------------------------
def test_multienzyme_does_not_cross_contaminate():
    seq = "GAATTCCCGGATCCAA"  # 16 bp: EcoRI at 0, BamHI at 8
    all_cuts = find_cuts(seq, "linear", ["EcoRI", "BamHI"])
    by = defaultdict(list)
    for c in all_cuts:
        by[c["enzyme"]].append(c)

    eco_frags = _fc_frag_lengths(by.get("EcoRI", []))
    bam_frags = _fc_frag_lengths(by.get("BamHI", []))

    # EcoRI single-site linear -> two fragments, lengths 1 and 15 (NOT 8, which
    # would be the gap to BamHI's cut).
    assert eco_frags == [1, 15], f"EcoRI fragment crossed into BamHI: got {eco_frags}, expected [1,15]"
    assert bam_frags == [9, 7], f"BamHI fragment wrong: got {bam_frags}, expected [9,7]"


# ---------------------------------------------------------------------------
# 6. HAND-COMPUTED: single cut on a CIRCULAR molecule yields ONE fragment
#    (the full circle). Sanity check that circular handling is correct.
# ---------------------------------------------------------------------------
def test_circular_single_cut_yields_one_full_fragment():
    seq = "GAATTC"  # circular, one EcoRI site
    cuts = find_cuts(seq, "circular", ["EcoRI"])
    frags = _fc_frag_lengths(cuts)
    assert frags == [6], f"circular single cut must give 1 fragment of full length 6, got {frags}"
