def read_fasta(path: str):
    name = "unnamed"
    topology = "circular"
    sequence_parts = []

    with open(path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith(">"):
                header = line[1:]
                parts = header.split()
                name = parts[0] if parts else "unnamed"
                topology = "circular" if "topology=circular" in header else "linear"
                continue
            sequence_parts.append(line)

    sequence = "".join(sequence_parts)
    return {"name": name, "sequence": sequence, "topology": topology, "length_bp": len(sequence)}


def write_fasta(path: str, data) -> None:
    import os

    name = data.get("name", "unnamed")
    sequence = data.get("sequence", "")
    topology = data.get("topology", "circular")
    header = f">{name} length={len(sequence)} topology={topology}"
    text = f"{header}\n{sequence}\n"
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
