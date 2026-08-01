import json
import os


def read_dna(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data


def write_dna(path: str, data) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
