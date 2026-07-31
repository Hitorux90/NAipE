#!/usr/bin/env python
# C:\ApE\src-tauri\sidecar\__main__.py
# Persistent NDJSON sidecar for ApE.
# Reads JSON lines from stdin, writes JSON lines to stdout.
# Pure stdlib only (json, sys, os).

import json
import os
import sys


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
                        "payload": {"error": f"parse error: {exc}"},
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
                        "payload": {"error": "expected object"},
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
                        "payload": {"error": "expected request with command"},
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

    if cmd == "new_sequence":
        name = payload.get("name", "unnamed")
        sequence = payload.get("sequence", "")
        topology = payload.get("topology", "circular")
        return {
            "id": msg_id,
            "type": "response",
            "command": "new_sequence",
            "payload": {
                "name": name,
                "sequence": sequence,
                "topology": topology,
                "length_bp": len(sequence),
            },
            "ok": True,
        }

    if cmd == "save_dna":
        target_path = payload.get("target_path")
        if not target_path:
            return _error(msg_id, cmd, "missing target_path")
        try:
            text = json.dumps(payload, indent=2)
            os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_dna",
                "payload": {"path": target_path},
                "ok": True,
            }
        except OSError as exc:
            return _error(msg_id, cmd, str(exc))

    if cmd == "save_fasta":
        target_path = payload.get("target_path")
        name = payload.get("name", "unnamed")
        sequence = payload.get("sequence", "")
        topology = payload.get("topology", "circular")
        if not target_path:
            return _error(msg_id, cmd, "missing target_path")
        try:
            header = f">{name} length={len(sequence)} topology={topology}"
            text = f"{header}\n{sequence}\n"
            os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as fh:
                fh.write(text)
            return {
                "id": msg_id,
                "type": "response",
                "command": "save_fasta",
                "payload": {"path": target_path},
                "ok": True,
            }
        except OSError as exc:
            return _error(msg_id, cmd, str(exc))

    if cmd == "open_file":
        target_path = payload.get("target_path")
        if not target_path:
            return _error(msg_id, cmd, "missing target_path")
        try:
            with open(target_path, "r", encoding="utf-8") as fh:
                text = fh.read()
            ext = os.path.splitext(target_path)[1].lower().lstrip(".")
            if ext == "dna":
                data = json.loads(text)
                return {
                    "id": msg_id,
                    "type": "response",
                    "command": "open_file",
                    "payload": {
                        "name": data.get("name", "unnamed"),
                        "sequence": data.get("sequence", ""),
                        "topology": data.get("topology", "circular"),
                        "length_bp": data.get("length_bp", 0),
                    },
                    "ok": True,
                }
            if ext == "fasta":
                lines = text.splitlines()
                header = lines[0] if lines else ""
                name = header.lstrip(">").split()[0] if header.startswith(">") else "unnamed"
                sequence = "".join(line.strip() for line in lines[1:] if line.strip())
                topology = "circular" if "topology=circular" in header else "linear"
                return {
                    "id": msg_id,
                    "type": "response",
                    "command": "open_file",
                    "payload": {
                        "name": name,
                        "sequence": sequence,
                        "topology": topology,
                        "length_bp": len(sequence),
                    },
                    "ok": True,
                }
            return _error(msg_id, cmd, f"unsupported extension: {ext}")
        except OSError as exc:
            return _error(msg_id, cmd, str(exc))

    return {
        "id": msg_id,
        "type": "response",
        "command": cmd,
        "payload": {"error": f"unknown command: {cmd}"},
        "ok": False,
    }


def _error(msg_id, cmd, message):
    return {
        "id": msg_id,
        "type": "response",
        "command": cmd,
        "payload": {"error": message},
        "ok": False,
    }


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
