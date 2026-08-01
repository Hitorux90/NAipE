import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from sidecar.adapters.gb import read_gb, write_gb


def test_read_gb_sample():
    path = os.path.join(ROOT, "test_data", "sample.gb")
    data = read_gb(path)
    assert data["accession"] == "SAMPLE_001"
    assert len(data["sequence"]) == 50
    assert data["length_bp"] == 50
    assert any(feature["note"] == "sample feature" for feature in data["features"])


def test_write_gb_roundtrip(tmp_path):
    original = {
        "locus": "rt_locus",
        "definition": "round trip",
        "accession": "RT001",
        "features": [{"type": "gene", "start": 1, "end": 10, "note": "rt_feature"}],
        "sequence": "ACGTACGTAC",
    }
    out = os.path.join(tmp_path, "rt.gb")
    write_gb(out, original)
    reloaded = read_gb(out)
    assert reloaded["accession"] == original["accession"]
    assert reloaded["sequence"] == original["sequence"]
    assert reloaded["features"][0]["note"] == "rt_feature"
