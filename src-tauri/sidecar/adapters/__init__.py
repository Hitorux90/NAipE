from sidecar.adapters.dna import read_dna, write_dna
from sidecar.adapters.fasta import read_fasta, write_fasta
from sidecar.adapters.gb import read_gb, write_gb


SUPPORTED_EXTENSIONS = {
    ".dna": (read_dna, write_dna),
    ".fasta": (read_fasta, write_fasta),
    ".gb": (read_gb, write_gb),
}


def read_format(path: str):
    ext = __ext(path)
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported format: {ext}")
    reader, _ = SUPPORTED_EXTENSIONS[ext]
    return reader(path)


def write_format(path: str, data) -> None:
    ext = __ext(path)
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported format: {ext}")
    _, writer = SUPPORTED_EXTENSIONS[ext]
    writer(path, data)


def __ext(path: str) -> str:
    import os
    return os.path.splitext(path)[1].lower()
