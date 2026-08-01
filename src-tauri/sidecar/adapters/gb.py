import re


def read_gb(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()

    entry = {
        "locus": _block_value(text, r"LOCUS\s+([^\s]+)"),
        "definition": _block_value(text, r"DEFINITION\s+(.+)"),
        "accession": _block_value(text, r"ACCESSION\s+([^\s]+)"),
        "features": _parse_features(text),
        "origin": _parse_origin(text),
    }
    entry["sequence"] = entry.pop("origin", "")
    entry["length_bp"] = len(entry["sequence"])
    return entry


def write_gb(path: str, data) -> None:
    import os

    locus = data.get("locus", "record")
    definition = data.get("definition", ".")
    accession = data.get("accession", "ACCESSION_MISSING")
    sequence = data.get("sequence", "")
    length_bp = len(sequence)
    features = data.get("features", [])

    lines = [
        "LOCUS       {:<30} {} bp    DNA     circular     2026-08-01".format(locus, length_bp),
        "ACCESSION   {}".format(accession),
        "VERSION     {}.1".format(accession),
        "KEYWORDS    .",
        "SOURCE      synthetic",
        "  ORGANISM  synthetic",
        "            .",
        "FEATURES             Location/Qualifiers",
    ]

    for feature in features:
        type_ = feature.get("type", "misc_feature")
        start = feature.get("start", 1)
        end = feature.get("end", max(start, length_bp))
        lines.append("     {:<16}{}..{}".format(type_, start, end))
        note = feature.get("note")
        if note:
            lines.append('                     /note="{}"'.format(note))

    lines.append("ORIGIN      ")
    seq = sequence or ""
    for i in range(0, len(seq), 60):
        chunk = seq[i : i + 60]
        spaced = " ".join(chunk[j : j + 10] for j in range(0, len(chunk), 10))
        lines.append("{:>9} {}".format(i + 1, spaced))
    lines.append("//")

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def _block_value(text: str, pattern: str):
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def _parse_features(text: str):
    features = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()

        if raw_line.startswith("     ") and len(raw_line) > 5 and raw_line[5] != " ":
            parts = stripped.split()
            if not parts:
                continue
            type_ = parts[0]
            location = parts[1] if len(parts) > 1 else "1..1"
            current = {
                "type": type_,
                "start": 1,
                "end": 1,
                "note": "",
            }
            bounds = location.replace("complement(", "").replace(")", "").split("..")
            if len(bounds) == 2:
                try:
                    current["start"] = int(bounds[0])
                except ValueError:
                    pass
                try:
                    current["end"] = int(bounds[1])
                except ValueError:
                    pass
            features.append(current)
            continue

        if raw_line.startswith("                     ") and stripped.startswith("/"):
            if features:
                features[-1]["note"] = stripped[6:].strip('"')
            continue

    return features


def _parse_origin(text: str):
    match = re.search(r"ORIGIN\s+", text)
    if not match:
        return ""
    origin_text = text[match.end() :]
    seq_parts = []
    for raw_line in origin_text.splitlines():
        line = raw_line.strip()
        if line == "//":
            break
        seq_parts.append("".join(part for part in line.split()[1:] if part.isalpha()))
    return "".join(seq_parts).upper()
