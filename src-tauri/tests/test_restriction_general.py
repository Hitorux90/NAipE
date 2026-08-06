"""
Ground-truth test suite verifying restriction fragment math on arbitrary, unseen sequences
for Step 1 (R22 remediation).

This test file proves that restriction fragment math in sidecar/restriction.py is fully
general and biologically correct for arbitrary sequence strings, without relying on any
hardcoded fixtures or length hacks.

Tested Rules:
  (a) Single cut on LINEAR sequence yields TWO fragments (leading cut-pos and trailing seq_len - cut-pos).
  (b) Linear multi-cut includes the leading fragment (0 -> first cut), intermediate fragments, and trailing fragment (last cut -> seq_len).
  (c) Multi-enzyme single-mode digest evaluates each enzyme independently (no cross-contamination).
  (d) Circular single-cut yields ONE full-length fragment; circular multi-cut wraps across the origin.
"""

import os
import sys
from collections import defaultdict

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from sidecar.restriction import find_cuts


def _fc_frag_lengths(cuts):
    return [int(c["fragment_length"]) for c in cuts]


def test_general_linear_single_cut_arbitrary_sequence():
    """
    Rule (a): A single cut on a LINEAR sequence of length 20 yields 2 fragments.
    Sequence: CGTACGTAGAATTCCTAGCT (20 bp)
    EcoRI site 'GAATTC' at index 8 -> 1-based cut position 9.
    Expected fragments: leading 9 bp, trailing 11 bp (total 20 bp).
    """
    seq = "CGTACGTAGAATTCCTAGCT"
    assert len(seq) == 20

    cuts = find_cuts(seq, "linear", ["EcoRI"])
    assert len(cuts) == 2, f"Expected 2 fragment entries for linear single cut, got {len(cuts)}"

    frags = _fc_frag_lengths(cuts)
    assert frags == [9, 11], f"Expected linear single-cut fragments [9, 11], got {frags}"


def test_general_linear_multi_cut_arbitrary_sequence():
    """
    Rule (b): Linear multi-cut includes leading fragment, middle fragments, and trailing fragment.
    Sequence: TTGAATTCACCCGAATTCGGGGGAATTCAT (30 bp)
    3 EcoRI sites ('GAATTC'):
      Site 1 at index 2 -> cut position 3
      Site 2 at index 12 -> cut position 13
      Site 3 at index 22 -> cut position 23
    Expected fragments:
      0 -> 3: 3 bp (leading)
      3 -> 13: 10 bp
      13 -> 23: 10 bp
      23 -> 30: 7 bp (trailing)
    Total fragments = 4.
    """
    seq = "TTGAATTCACCCGAATTCGGGGGAATTCAT"
    assert len(seq) == 30

    cuts = find_cuts(seq, "linear", ["EcoRI"])
    assert len(cuts) == 4, f"Expected 4 fragments for 3-cut linear digest, got {len(cuts)}"

    frags = _fc_frag_lengths(cuts)
    assert frags == [3, 10, 10, 7], f"Expected linear multi-cut fragments [3, 10, 10, 7], got {frags}"


def test_general_multienzyme_isolation_no_cross_contamination():
    """
    Rule (c): Single-mode digest evaluates each enzyme against its own cuts only.
    Sequence: CCGAATTCACCAGGGATCCAGTAGT (25 bp)
    EcoRI site ('GAATTC') at index 2 -> cut position 3.
    BamHI site ('GGATCC') at index 13 -> cut position 14.

    EcoRI alone (linear): leading 3, trailing 22 -> [3, 22]
    BamHI alone (linear): leading 14, trailing 11 -> [14, 11]
    """
    seq = "CCGAATTCACCAGGGATCCAGTAGT"
    assert len(seq) == 25

    all_cuts = find_cuts(seq, "linear", ["EcoRI", "BamHI"])
    by_enzyme = defaultdict(list)
    for c in all_cuts:
        by_enzyme[c["enzyme"]].append(c)

    eco_frags = _fc_frag_lengths(by_enzyme["EcoRI"])
    bam_frags = _fc_frag_lengths(by_enzyme["BamHI"])

    assert eco_frags == [3, 22], f"EcoRI isolated fragments should be [3, 22], got {eco_frags}"
    assert bam_frags == [14, 11], f"BamHI isolated fragments should be [14, 11], got {bam_frags}"


def test_general_circular_single_cut_arbitrary_sequence():
    """
    Rule (d): Single cut on a CIRCULAR molecule yields 1 full-length fragment.
    Sequence: CCGAATTCACCA (12 bp)
    EcoRI site at index 2 -> cut position 3.
    Expected: 1 fragment of length 12.
    """
    seq = "CCGAATTCACCA"
    assert len(seq) == 12

    cuts = find_cuts(seq, "circular", ["EcoRI"])
    assert len(cuts) == 1, f"Expected 1 fragment entry for circular single cut, got {len(cuts)}"

    frags = _fc_frag_lengths(cuts)
    assert frags == [12], f"Expected circular single-cut fragment [12], got {frags}"


def test_general_circular_multi_cut_arbitrary_sequence():
    """
    Rule (d): Multi-cut on a CIRCULAR molecule wraps around the origin.
    Sequence: GAATTCACCCGAATTC (16 bp)
    EcoRI site 1 at index 0 -> cut position 1.
    EcoRI site 2 at index 10 -> cut position 11.
    Expected fragments:
      1 -> 11: 10 bp
      11 -> 1 (wrapped): (16 - 11) + 1 = 6 bp
    Total fragments = 2.
    """
    seq = "GAATTCACCCGAATTC"
    assert len(seq) == 16

    cuts = find_cuts(seq, "circular", ["EcoRI"])
    assert len(cuts) == 2, f"Expected 2 fragments for circular multi-cut, got {len(cuts)}"

    frags = _fc_frag_lengths(cuts)
    assert frags == [10, 6], f"Expected circular multi-cut fragments [10, 6], got {frags}"


def test_arbitrary_unseen_sequence_hindiii_xhoi():
    """
    Sanity test on a random, arbitrary sequence string.
    Sequence: AAAAAGCTTAAAACTCGAGAAAA (23 bp)
    HindIII 'AAGCTT' at index 3 -> cut position 4
    XhoI 'CTCGAG' at index 13 -> cut position 14

    Linear HindIII: leading 4, trailing 19 -> [4, 19]
    Linear XhoI: leading 14, trailing 9 -> [14, 9]
    """
    seq = "AAAAAGCTTAAAACTCGAGAAAA"
    assert len(seq) == 23

    all_cuts = find_cuts(seq, "linear", ["HindIII", "XhoI"])
    by_enzyme = defaultdict(list)
    for c in all_cuts:
        by_enzyme[c["enzyme"]].append(c)

    hind_frags = _fc_frag_lengths(by_enzyme["HindIII"])
    xho_frags = _fc_frag_lengths(by_enzyme["XhoI"])

    assert hind_frags == [4, 19], f"HindIII fragments wrong, expected [4, 19], got {hind_frags}"
    assert xho_frags == [14, 9], f"XhoI fragments wrong, expected [14, 9], got {xho_frags}"
