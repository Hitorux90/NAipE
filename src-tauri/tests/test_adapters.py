import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.append(ROOT)

from sidecar.adapters import read_format, write_format


def test_read_format_dispatch_exists():
    assert callable(read_format)


def test_write_format_dispatch_exists():
    assert callable(write_format)


def test_read_format_supported_extensions():
    base = os.path.join(ROOT, "test_data")
    for ext in [".dna", ".fasta", ".gb"]:
        path = os.path.join(base, "sample" + ext)
        if not os.path.exists(path):
            continue
        data = read_format(path)
        assert data is not None
