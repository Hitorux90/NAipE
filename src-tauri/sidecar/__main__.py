#!/usr/bin/env python
# C:\ApE\src-tauri\sidecar\__main__.py
# Persistent NDJSON sidecar for ApE.
# Reads JSON lines from stdin, writes JSON lines to stdout.
# Pure stdlib only (json, sys, os).

import json
import os
import sys


def _find_db_path() -> str:
    candidates = []
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(here, "target", "debug", "ape.db"))
    candidates.append(os.path.join(here, "..", "target", "debug", "ape.db"))
    candidates.append(os.path.join(here, "..", "..", "target", "debug", "ape.db"))
    for candidate in candidates:
        if os.path.exists(candidate):
            return os.path.abspath(candidate)
    return ""


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            print(
                json.dumps(
                    {
                        "id": None,
                        "type": "response",
                        "command": None,
                        "payload": {"error": "INVALID_REQUEST", "message": "parse error: {}".format(exc)},
                        "ok": False,
                    }
                ),
                flush=True,
            )
            continue

        if not isinstance(msg, dict):
            print(
                json.dumps(
                    {
                        "id": None,
                        "type": "response",
                        "command": None,
                        "payload": {"error": "INVALID_REQUEST", "message": "expected object"},
                        "ok": False,
                    }
                ),
                flush=True,
            )
            continue

        msg_id = msg.get("id")
        cmd = msg.get("command")
        msg_type = msg.get("type")
        payload = msg.get("payload") or {}

        if msg_type != "request" or cmd is None:
            print(
                json.dumps(
                    {
                        "id": msg_id,
                        "type": "response",
                        "command": cmd,
                        "payload": {"error": "INVALID_REQUEST", "message": "expected request with command"},
                        "ok": False,
                    }
                ),
                flush=True,
            )
            continue

        response = _handle_command(cmd, msg_id, payload)

        print(json.dumps(response), flush=True)


def _handle_command(cmd, msg_id, payload):
    if cmd == "ping":
        return {
            "id": msg_id,
            "type": "response",
            "command": "ping",
            "payload": {"pong": True},
            "ok": True,
        }

    if cmd == "list_parts":
        return {
            "id": msg_id,
            "type": "response",
            "command": "list_parts",
            "payload": {"parts": []},
            "ok": True,
        }

    if cmd == "create_sequence":
        name = payload.get("name", "unnamed")
        sequence = payload.get("sequence", "")
        topology = payload.get("topology", "circular")
        return {
            "id": msg_id,
            "type": "response",
            "command": "create_sequence",
            "payload": {
                "name": name,
                "sequence": sequence,
                "topology": topology,
                "length_bp": len(sequence),
            },
            "ok": True,
        }

    if cmd == "new_sequence":
        response = _handle_command("create_sequence", msg_id, payload)
        response["command"] = "new_sequence"
        response.setdefault("payload", {})["deprecated"] = True
        return response

    if cmd == "save_as_dna":
        target_path = payload.get("target_path")
        if not target_path:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing target_path")
        try:
            text = json.dumps(payload, indent=2)
            os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_as_dna",
                "payload": {"path": target_path},
                "ok": True,
            }
        except OSError as exc:
            return _error(msg_id, cmd, "PERMISSION_DENIED", str(exc))

    if cmd == "save_dna":
        response = _handle_command("save_as_dna", msg_id, payload)
        response["command"] = "save_dna"
        response.setdefault("payload", {})["deprecated"] = True
        return response

    if cmd == "save_as_fasta":
        target_path = payload.get("target_path")
        name = payload.get("name", "unnamed")
        sequence = payload.get("sequence", "")
        topology = payload.get("topology", "circular")
        if not target_path:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing target_path")
        try:
            header = ">{} length={} topology={}".format(name, len(sequence), topology)
            text = "{}\n{}\n".format(header, sequence)
            os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_as_fasta",
                "payload": {"path": target_path},
                "ok": True,
            }
        except OSError as exc:
            return _error(msg_id, cmd, "PERMISSION_DENIED", str(exc))

    if cmd == "save_fasta":
        response = _handle_command("save_as_fasta", msg_id, payload)
        response["command"] = "save_fasta"
        response.setdefault("payload", {})["deprecated"] = True
        return response

    if cmd == "save_as_gb":
        target_path = payload.get("target_path")
        name = payload.get("name", "unnamed")
        sequence = payload.get("sequence", "")
        topology = payload.get("topology", "circular")
        if not target_path:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing target_path")
        try:
            from sidecar.adapters.gb import write_gb
            data = {
                "locus": name,
                "sequence": sequence,
                "topology": topology,
                "length_bp": len(sequence),
                "features": payload.get("features", []),
            }
            write_gb(target_path, data)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_as_gb",
                "payload": {"path": target_path},
                "ok": True,
            }
        except (OSError, ValueError) as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "open_file":
        target_path = payload.get("target_path")
        if not target_path:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing target_path")
        try:
            from sidecar.adapters import read_format
            data = read_format(target_path)
            return {
                "id": msg_id,
                "type": "response",
                "command": "open_file",
                "payload": {
                    "name": data.get("name", "unnamed"),
                    "sequence": data.get("sequence", ""),
                    "topology": data.get("topology", "circular"),
                    "length_bp": data.get("length_bp", 0),
                    "deprecated": True,
                },
                "ok": True,
            }
        except ValueError as exc:
            return _error(msg_id, cmd, "INVALID_REQUEST", str(exc))
        except OSError as exc:
            return _error(msg_id, cmd, "FILE_NOT_FOUND", str(exc))

    if cmd == "open_sequence":
        payload["target_path"] = payload.get("target_path")
        response = _handle_command("open_file", msg_id, payload)
        response["command"] = "open_sequence"
        response.setdefault("payload", {})["deprecated"] = False
        return response

    if cmd == "list_sequences":
        db_path = payload.get("db_path") or _find_db_path()
        if not db_path or not os.path.exists(db_path):
            return {
                "id": msg_id,
                "type": "response",
                "command": "list_sequences",
                "payload": {"sequences": []},
                "ok": True,
            }
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id, name, topology, length_bp, created_at_ms FROM sequences")
            rows = cur.fetchall()
            sequences = []
            for row in rows:
                sequences.append({
                    "id": row["id"],
                    "name": row["name"],
                    "topology": row["topology"],
                    "length_bp": row["length_bp"],
                    "created_at_ms": row["created_at_ms"],
                })
            conn.close()
            return {
                "id": msg_id,
                "type": "response",
                "command": "list_sequences",
                "payload": {"sequences": sequences},
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "create_construct":
        db_path = payload.get("db_path") or _find_db_path()
        if not db_path or not os.path.exists(db_path):
            return _error(msg_id, cmd, "INTERNAL_ERROR", "database not found")
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO Constructs (name, sequence_id, created_at_ms) VALUES (?, ?, ?)",
                (
                    payload.get("name", "unnamed"),
                    payload.get("sequence_id", 0),
                    __import__("time").time() * 1000,
                ),
            )
            conn.commit()
            construct_id = cur.lastrowid
            conn.close()
            return {
                "id": msg_id,
                "type": "response",
                "command": "create_construct",
                "payload": {"id": construct_id, "name": payload.get("name", "unnamed")},
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "add_part_to_construct":
        db_path = payload.get("db_path") or _find_db_path()
        if not db_path or not os.path.exists(db_path):
            return _error(msg_id, cmd, "INTERNAL_ERROR", "database not found")
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO Construct_Parts (construct_id, part_id, start, end, strand, color, \"order\", created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    payload.get("construct_id"),
                    payload.get("part_id"),
                    payload.get("start", 0),
                    payload.get("end", 0),
                    payload.get("strand", 1),
                    payload.get("color"),
                    payload.get("order", 0),
                    __import__("time").time() * 1000,
                ),
            )
            conn.commit()
            part_id = cur.lastrowid
            conn.close()
            return {
                "id": msg_id,
                "type": "response",
                "command": "add_part_to_construct",
                "payload": {"id": part_id},
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "save_construct":
        db_path = payload.get("db_path") or _find_db_path()
        target_path = payload.get("target_path")
        construct_id = payload.get("construct_id")
        if not target_path:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing target_path")
        if not db_path or not os.path.exists(db_path):
            return _error(msg_id, cmd, "INTERNAL_ERROR", "database not found")
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id, name, sequence_id, created_at_ms FROM Constructs WHERE id = ?", (construct_id,))
            construct = cur.fetchone()
            if not construct:
                conn.close()
                return _error(msg_id, cmd, "SEQUENCE_NOT_FOUND", "construct not found")
            cur.execute(
                "SELECT part_id, start, end, strand, color, \"order\" FROM Construct_Parts WHERE construct_id = ? ORDER BY \"order\"",
                (construct_id,),
            )
            parts = []
            for row in cur.fetchall():
                parts.append({
                    "part_id": row["part_id"],
                    "start": row["start"],
                    "end": row["end"],
                    "strand": row["strand"],
                    "color": row["color"],
                    "order": row["order"],
                })
            conn.close()
            data = {
                "name": construct["name"],
                "construct_id": construct["id"],
                "sequence_id": construct["sequence_id"],
                "parts": parts,
            }
            os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_construct",
                "payload": {"path": target_path},
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "list_constructs":
        db_path = payload.get("db_path") or _find_db_path()
        if not db_path or not os.path.exists(db_path):
            return {
                "id": msg_id,
                "type": "response",
                "command": "list_constructs",
                "payload": {"constructs": []},
                "ok": True,
            }
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id, name, sequence_id, created_at_ms FROM Constructs")
            rows = cur.fetchall()
            constructs = []
            for row in rows:
                constructs.append({
                    "id": row["id"],
                    "name": row["name"],
                    "sequence_id": row["sequence_id"],
                    "created_at_ms": row["created_at_ms"],
                })
            conn.close()
            return {
                "id": msg_id,
                "type": "response",
                "command": "list_constructs",
                "payload": {"constructs": constructs},
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "open_construct":
        db_path = payload.get("db_path") or _find_db_path()
        construct_id = payload.get("construct_id")
        if not db_path or not os.path.exists(db_path):
            return _error(msg_id, cmd, "INTERNAL_ERROR", "database not found")
        if construct_id is None:
            return _error(msg_id, cmd, "INVALID_REQUEST", "missing construct_id")
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT name, sequence_id, created_at_ms FROM Constructs WHERE id = ?", (construct_id,))
            construct = cur.fetchone()
            if not construct:
                conn.close()
                return _error(msg_id, cmd, "SEQUENCE_NOT_FOUND", "construct not found")
            cur.execute(
                'SELECT part_id, start, end, strand, color, "order" FROM Construct_Parts WHERE construct_id = ? ORDER BY "order"',
                (construct_id,),
            )
            parts = []
            for row in cur.fetchall():
                parts.append({
                    "part_id": row["part_id"],
                    "start": row["start"],
                    "end": row["end"],
                    "strand": row["strand"],
                    "color": row["color"],
                    "order": row["order"],
                })
            conn.close()
            return {
                "id": msg_id,
                "type": "response",
                "command": "open_construct",
                "payload": {
                    "id": construct_id,
                    "name": construct["name"],
                    "sequence_id": construct["sequence_id"],
                    "created_at_ms": construct["created_at_ms"],
                    "parts": parts,
                },
                "ok": True,
            }
        except Exception as exc:
            return _error(msg_id, cmd, "INTERNAL_ERROR", str(exc))

    if cmd == "undo":
        return _error(msg_id, cmd, "UNKNOWN_COMMAND", "undo requires Rust-owned stack; not exposed via sidecar yet")

    if cmd == "redo":
        return _error(msg_id, cmd, "UNKNOWN_COMMAND", "redo requires Rust-owned stack; not exposed via sidecar yet")

    return {
        "id": msg_id,
        "type": "response",
        "command": cmd,
        "payload": {"error": "UNKNOWN_COMMAND", "message": "unknown command: {}".format(cmd)},
        "ok": False,
    }


def _error(msg_id, cmd, code, message):
    return {
        "id": msg_id,
        "type": "response",
        "command": cmd,
        "payload": {"error": code, "message": message},
        "ok": False,
    }


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
