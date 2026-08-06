"""
Ground-truth test suite verifying the REBASE enzyme catalog and combined-digest mode
for Step 1 of NAipE remediation.

Biopython's `Bio.Restriction` module is used as an independent ground-truth oracle.
"""

import os
import sys
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

Bio = pytest.importorskip("Bio")
from Bio import SeqIO  # noqa: E402
from Bio.Seq import Seq  # noqa: E402
from Bio.Restriction import Restriction as R  # noqa: E402

from sidecar.restriction import get_all_enzymes_catalog, _find_cuts_combined  # noqa: E402

TEST_DATA = os.path.join(ROOT, "test_data")

# Representative sample of enzymes:
# Standard 6-cutters (sticky & blunt), 4-cutters, 8-cutters, Type IIS, and negative-fst5 enzyme (BaeI)
SAMPLE_ENZYMES = [
    # Requested standard sample
    "EcoRI", "BamHI", "HindIII", "XhoI", "BsaI", "PmeI",
    "PacI", "NdeI", "PstI", "ApaI", "DpnI", "BsmBI",
    # 10+ additional diverse enzymes (blunt/sticky, 4/6/8-cutters)
    "NotI", "SmaI", "SpeI", "XbaI", "SacI", "KpnI",
    "SalI", "ClaI", "SphI", "EagI", "EcoRV", "DraI",
    # Negative fst5 enzyme (cuts 5' of recognition site)
    "BaeI",
]


def test_catalog_size_meets_rebase_claim():
    """Assert that get_all_enzymes_catalog contains >= 1000 enzymes (~1,080 REBASE claim)."""
    catalog = get_all_enzymes_catalog()
    assert len(catalog) >= 1000, f"Expected catalog size >= 1000, got {len(catalog)}"


@pytest.mark.parametrize("name", SAMPLE_ENZYMES)
def test_catalog_sample_enzymes_match_biopython(name):
    """
    Assert that get_all_enzymes_catalog()[name] matches Biopython Bio.Restriction oracle:
      - site == str(enz.site).upper()
      - cut_offset == enz.fst5
      - is_blunt == enz.is_blunt()
    """
    catalog = get_all_enzymes_catalog()
    assert name in catalog, f"Enzyme {name} missing from catalog"
    cat_info = catalog[name]

    enz = getattr(R, name, None)
    assert enz is not None, f"Enzyme {name} missing from Biopython oracle"

    expected_site = str(enz.site).upper()
    expected_offset = enz.fst5
    expected_blunt = bool(enz.is_blunt())

    assert cat_info["site"] == expected_site, (
        f"Catalog site mismatch for {name}: got '{cat_info['site']}', expected '{expected_site}'"
    )
    assert cat_info["cut_offset"] == expected_offset, (
        f"Catalog cut_offset mismatch for {name}: got {cat_info['cut_offset']}, expected fst5={expected_offset}"
    )
    assert cat_info["is_blunt"] == expected_blunt, (
        f"Catalog is_blunt mismatch for {name}: got {cat_info['is_blunt']}, expected {expected_blunt}"
    )


def _compute_biopython_combined_frags(seq, is_circular, enzymes):
    """Compute expected combined digest physical fragment lengths using Biopython cut search."""
    seq_len = len(seq)
    seq_upper = seq.upper()
    bio_cut_positions = []

    for ename in enzymes:
        enz = getattr(R, ename)
        site = str(enz.site).upper()
        offset = enz.fst5
        site_len = len(site)
        search_seq = seq_upper + (seq_upper[: site_len - 1] if is_circular else "")

        start_idx = 0
        while True:
            idx = search_seq.find(site, start_idx)
            if idx == -1:
                break
            if not is_circular and idx >= seq_len:
                break
            pos = (idx + offset) % seq_len
            if pos == 0:
                pos = seq_len
            bio_cut_positions.append(pos)
            start_idx = idx + 1

    bio_cut_positions = sorted(bio_cut_positions)

    if not bio_cut_positions:
        return [seq_len]

    if is_circular:
        n = len(bio_cut_positions)
        frags = []
        for i in range(n):
            cur = bio_cut_positions[i]
            nxt = bio_cut_positions[(i + 1) % n]
            frags.append((seq_len - cur) + nxt if i == n - 1 else nxt - cur)
        return sorted(frags)
    else:
        prev = 0
        frags = []
        for p in bio_cut_positions:
            frags.append(p - prev)
            prev = p
        frags.append(seq_len - prev)
        return sorted(frags)


PLASMID_DIGEST_TESTS = [
    ("pMG_SP-4_speB.gb", ["EcoRI", "SpeI", "HindIII"]),
    ("PRL-24.gb", ["XhoI", "HindIII"]),
    ("pL41_Trf_SP4.gb", ["HindIII", "SpeI"]),
    ("pL41_Trf_SP4.gb", ["XhoI", "UcoMSI"]),
]


@pytest.mark.parametrize("filename,enzymes", PLASMID_DIGEST_TESTS)
def test_combined_digest_matches_biopython(filename, enzymes):
    """
    Assert that _find_cuts_combined sorted fragment lengths match an independent
    Biopython-computed combined digest for real plasmids.
    """
    path = os.path.join(TEST_DATA, filename)
    rec = SeqIO.read(path, "genbank")
    seq = str(rec.seq).upper()
    seq_len = len(seq)
    is_circular = str(rec.annotations.get("topology", "")).lower() == "circular"

    cuts = _find_cuts_combined(seq, seq_len, is_circular, enzymes)
    sidecar_frags = sorted(c["fragment_length"] for c in cuts)

    expected_frags = _compute_biopython_combined_frags(seq, is_circular, enzymes)

    assert sidecar_frags == expected_frags, (
        f"{filename} combined digest mismatch for {enzymes}: "
        f"sidecar={sidecar_frags}, expected={expected_frags}"
    )
