import json
import subprocess
import sys

import pytest

PYTHON_EXE = r"C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe"
SIDECAR_MODULE = "sidecar.__main__"


def spawn_sidecar():
    return subprocess.Popen(
        [PYTHON_EXE, "-u", "-m", SIDECAR_MODULE],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=r"C:\ApE\src-tauri",
    )


def send(proc, msg):
    line = json.dumps(msg)
    proc.stdin.write(line + "\n")
    proc.stdin.flush()


def read(proc):
    line = proc.stdout.readline()
    if not line:
        return None
    return json.loads(line)


@pytest.fixture()
def sidecar_proc():
    proc = spawn_sidecar()
    try:
        yield proc
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_ping(sidecar_proc):
    msg_id = "test-ping-1"
    send(sidecar_proc, {"id": msg_id, "type": "request", "command": "ping", "payload": {}})
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "ping"
    assert resp["ok"] is True
    assert resp["payload"]["pong"] is True


def test_list_parts(sidecar_proc):
    msg_id = "test-list-1"
    send(
        sidecar_proc,
        {"id": msg_id, "type": "request", "command": "list_parts", "payload": {}},
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "list_parts"
    assert resp["ok"] is True
    assert resp["payload"]["parts"] == []


def test_new_sequence(sidecar_proc):
    msg_id = "test-new-seq"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "new_sequence",
            "payload": {"name": "sidecar_seq", "sequence": "ATGC", "topology": "circular"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "new_sequence"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "sidecar_seq"


def test_save_dna(sidecar_proc):
    msg_id = "test-save-dna"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_dna",
            "payload": {"name": "saved_seq", "sequence": "ATGC", "target_path": r"C:\ApE\src-tauri\target\debug\saved_seq.dna"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "save_dna"
    assert resp["ok"] is True


def test_save_fasta(sidecar_proc):
    msg_id = "test-save-fasta"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_fasta",
            "payload": {"name": "saved_fasta", "sequence": "AAAA", "target_path": r"C:\ApE\src-tauri\target\debug\saved_fasta.fasta"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "save_fasta"
    assert resp["ok"] is True


def test_open_file(sidecar_proc):
    msg_id = "test-open-file"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "open_file",
            "payload": {"target_path": r"C:\ApE\src-tauri\target\debug\saved_seq.dna"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "open_file"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "saved_seq"


def test_unknown_command(sidecar_proc):
    msg_id = "test-unknown-1"
    send(
        sidecar_proc,
        {"id": msg_id, "type": "request", "command": "not_a_real_command", "payload": {}},
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["ok"] is False
    assert "unknown command" in resp["payload"]["error"]


def test_malformed_json(sidecar_proc):
    sidecar_proc.stdin.write("not json\n")
    sidecar_proc.stdin.flush()
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["ok"] is False
    assert "parse error" in resp["payload"]["error"]
