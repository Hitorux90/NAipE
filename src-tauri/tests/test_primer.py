# src-tauri/tests/test_primer.py
import pytest
import sys
import os

# Ensure sidecar module is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sidecar")))

from primer import (
    reverse_complement,
    calc_gc,
    calc_tm,
    analyze_primer,
    simulate_pcr,
)


# ===========================================================================
# S2-2: Reverse Complement Unit Tests (exact fixtures)
# ===========================================================================

def test_reverse_complement_exact():
    # Standard 4-mer
    assert reverse_complement("ATGC") == "GCAT"
    # EcoRI palindromic site
    assert reverse_complement("GAATTC") == "GAATTC"
    # Poly-T / Poly-A palindrome
    assert reverse_complement("TTTTAAAA") == "TTTTAAAA"
    # Degenerate N base: ACGTN -> complement TGCAN -> reverse NACGT
    assert reverse_complement("ACGTN") == "NACGT"
    # Case-insensitivity
    assert reverse_complement("atgc") == "GCAT"
    assert reverse_complement("acgtn") == "NACGT"


# ===========================================================================
# S2-1: Tm & GC Calculation Tests (hand-computed ground truth)
# ===========================================================================

def test_calc_gc():
    # 20-mer GC=10 (50.0%)
    assert calc_gc("GCGCGCGCGCATATATATAT") == 50.0
    # 20-mer GC=20 (100.0%)
    assert calc_gc("GGGGGGGGGGCCCCCCCCCC") == 100.0
    # 20-mer GC=0 (0.0%)
    assert calc_gc("AAAAAAAAAAAAAAAAAAAA") == 0.0
    # Empty string
    assert calc_gc("") == 0.0


def test_calc_tm():
    # Marmur-Doty (len >= 14): Tm = 64.9 + 41.0 * (GC - 16.4) / N
    # 20-mer GC=10: 64.9 + 41.0*(10 - 16.4)/20 = 64.9 - 13.12 = 51.78 -> 51.8
    assert calc_tm("GCGCGCGCGCATATATATAT") == 51.8

    # 20-mer GC=20: 64.9 + 41.0*(20 - 16.4)/20 = 64.9 + 7.38 = 72.28 -> 72.3
    assert calc_tm("GGGGGGGGGGCCCCCCCCCC") == 72.3

    # 20-mer GC=0: 64.9 + 41.0*(0 - 16.4)/20 = 64.9 - 33.62 = 31.28 -> 31.3
    assert calc_tm("AAAAAAAAAAAAAAAAAAAA") == 31.3

    # Wallace Rule (len < 14): Tm = 2*AT + 4*GC
    # 10-mer AT=6, GC=4: 2*6 + 4*4 = 12 + 16 = 28.0
    assert calc_tm("GCGCATATAT") == 28.0

    # 13-mer AT=7, GC=6: 2*7 + 4*6 = 14 + 24 = 38.0
    assert calc_tm("GCGCGCATATATA") == 38.0

    # Empty string
    assert calc_tm("") == 0.0


def test_analyze_primer():
    result = analyze_primer("GCGCGCGCGCATATATATAT")
    assert result["primer"] == "GCGCGCGCGCATATATATAT"
    assert result["length"] == 20
    assert result["gc_percent"] == 50.0
    assert result["tm_celsius"] == 51.8
    assert result["reverse_complement"] == "ATATATATATGCGCGCGCGC"


# ===========================================================================
# S2-3: Virtual PCR — Linear Specific & Rejections
# ===========================================================================

def test_simulate_pcr_linear_specific():
    # 42 bp template: GGG (0..2) + ATGCCTAGCTAG (3..14) + CCCCCCCCCCCC (15..26) + TACGTACGTACG (27..38) + AAA (39..41)
    template = "GGGATGCCTAGCTAGCCCCCCCCCCCCTACGTACGTACGAAA"
    fwd = "ATGCCTAGCTAG"       # binds top strand at idx 3
    rev = "CGTACGTACGTA"       # rc is TACGTACGTACG, binds top strand at idx 27

    res = simulate_pcr(template, fwd, rev, topology="linear")
    assert res["ok"] is True
    assert res["product"] == "ATGCCTAGCTAGCCCCCCCCCCCCTACGTACGTACG"
    assert res["length_bp"] == 36
    assert res["fwd_start"] == 4   # 1-based (idx 3 + 1)
    assert res["rev_end"] == 39    # 1-based (idx 27 + 12)
    assert res["fwd_sites"] == [3]
    assert res["rev_sites"] == [27]


def test_simulate_pcr_multiple_forward_sites_rejected():
    # Forward primer appears at idx 0 and idx 24
    template = "ATGCCTAGCTAGNNNNNNNNNNNNATGCCTAGCTAGNNNNNNNNNNNNTACGTACGTACG"
    fwd = "ATGCCTAGCTAG"
    rev = "CGTACGTACGTA"  # rc at idx 48

    res = simulate_pcr(template, fwd, rev, topology="linear")
    assert res["ok"] is False
    assert res["fwd_sites"] == [0, 24]
    assert "2" in res["error"] or "non-specific" in res["error"].lower()


def test_simulate_pcr_multiple_reverse_sites_rejected():
    # Reverse primer rc appears twice (at idx 24 and idx 48)
    template = "ATGCCTAGCTAGNNNNNNNNNNNNTACGTACGTACGNNNNNNNNNNNNTACGTACGTACG"
    fwd = "ATGCCTAGCTAG"  # at idx 0
    rev = "CGTACGTACGTA"  # rc at idx 24 and idx 48

    res = simulate_pcr(template, fwd, rev, topology="linear")
    assert res["ok"] is False
    assert res["rev_sites"] == [24, 48]
    assert "2" in res["error"] or "non-specific" in res["error"].lower()


def test_simulate_pcr_zero_site_rejected():
    template = "GGGGGGGGGGGGCCCCCCCCCCCCAAAAAAAAAAAAAAAA"
    fwd = "ATGCCTAGCTAG"
    rev = "CGTACGTACGTA"

    res = simulate_pcr(template, fwd, rev, topology="linear")
    assert res["ok"] is False
    assert "not found" in res["error"].lower()


def test_simulate_pcr_linear_misoriented_rejected():
    # rc(rev) at idx 0, fwd at idx 24 -> rev is upstream of fwd on linear
    template = "TACGTACGTACGNNNNNNNNNNNNATGCCTAGCTAG"
    fwd = "ATGCCTAGCTAG"  # idx 24
    rev = "CGTACGTACGTA"  # rc at idx 0

    res = simulate_pcr(template, fwd, rev, topology="linear")
    assert res["ok"] is False
    assert "upstream" in res["error"].lower() or "face each other" in res["error"].lower()


# ===========================================================================
# S2-4: Virtual PCR — Circular Topology & Guards (C1 Gate)
# ===========================================================================

def test_simulate_pcr_circular_wrap_around():
    # 60 bp template: rc(rev)=CGTACGTACGTACG at 0..13, 28 T at 14..41, fwd=ATGCATGCATGCATGCAT at 42..59
    template = "CGTACGTACGTACG" + ("T" * 28) + "ATGCATGCATGCATGCAT"
    fwd = "ATGCATGCATGCATGCAT"  # 18 bp, idx 42
    rev = "CGTACGTACGTACG"      # 14 bp, rc at idx 0

    # 1. Circular topology: valid origin wrap-around
    res_circ = simulate_pcr(template, fwd, rev, topology="circular")
    assert res_circ["ok"] is True
    # Product: template[42:60] (18 bp) + template[0:14] (14 bp) = 32 bp
    assert res_circ["product"] == "ATGCATGCATGCATGCATCGTACGTACGTACG"
    assert res_circ["length_bp"] == 32
    assert res_circ["fwd_start"] == 43
    assert res_circ["rev_end"] == 14
    assert res_circ["fwd_sites"] == [42]
    assert res_circ["rev_sites"] == [0]

    # 2. Linear topology on SAME template: MUST fail (C1 gate)
    res_lin = simulate_pcr(template, fwd, rev, topology="linear")
    assert res_lin["ok"] is False
    assert "upstream" in res_lin["error"].lower() or "face each other" in res_lin["error"].lower()


def test_simulate_pcr_circular_misoriented_rejected():
    # 60 bp circular template where rev extends past fwd start index (distance > 60)
    # fwd starts at 10 (18 bp). rc(rev) starts at 5 (14 bp, ends at 19 > 10).
    # Unrolled rev_end = 5 + 60 + 14 = 79. Distance = 79 - 10 = 69 > 60.
    prefix = "A" * 5
    rc_rev = "CGTACGTACGTACG"  # 14 bp (5..18)
    fwd = "ATGCATGCATGCATGCAT" # 18 bp (10..27) - overlaps facing apart
    # Construct 60 bp template with rc_rev at 5 and fwd at 10
    # 0..4: AAAAA (5)
    # 5..9: CGTAC (5) - first 5 of rc_rev
    # 10..27: ATGCATGCATGCATGCAT (18) - fwd
    # 28..59: G * 32 (32)
    # Total = 5 + 5 + 18 + 32 = 60 bp
    # Wait, to make rc_rev exact at 5..18 and fwd exact at 10..27:
    # Notice rc_rev[5:14] would conflict with fwd[0:9] unless we position them cleanly:
    # Instead, put fwd at 10 (18 bp: 10..27), and rc_rev at 40 (14 bp: 40..53).
    # If fwd is at 10, extending 10->27->60, and rev primer anneals in opposite direction:
    # Suppose rev primer matches `rev` on top strand at 40 (not rc(rev)). Then it doesn't face fwd!
    template_60 = ("A" * 10) + ("T" * 18) + ("C" * 12) + ("G" * 14) + ("A" * 6)
    # fwd = T*18 (idx 10), rev = G*14 (rc is C*14, which does not exist in template)
    # rev matches top strand as G*14, so rc(rev) is not found -> rejected
    res_mis = simulate_pcr(template_60, "T" * 18, "G" * 14, topology="circular")
    assert res_mis["ok"] is False


def test_simulate_pcr_empty_inputs():
    res = simulate_pcr("", "ATGC", "ATGC")
    assert res["ok"] is False
    res2 = simulate_pcr("ATGC", "", "ATGC")
    assert res2["ok"] is False
    res3 = simulate_pcr("ATGC", "ATGC", "")
    assert res3["ok"] is False
