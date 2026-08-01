import json
import os
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


@pytest.fixture()
def sidecar_proc_with_db(tmp_path):
    db_path = tmp_path / "ape.db"
    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Constructs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sequence_id INTEGER,
            created_at_ms INTEGER NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Construct_Parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            construct_id INTEGER NOT NULL,
            part_id TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            strand INTEGER NOT NULL,
            color TEXT,
            "order" INTEGER NOT NULL,
            created_at_ms INTEGER NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Construct_Annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            construct_part_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            feature_type TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            strand INTEGER NOT NULL,
            color TEXT,
            created_at_ms INTEGER NOT NULL
        )
    """)
    conn.commit()
    conn.close()

    import os
    old_cwd = os.getcwd()
    os.chdir(r"C:\ApE\src-tauri")
    target_dir = os.path.join(r"C:\ApE\src-tauri", "target", "debug")
    os.makedirs(target_dir, exist_ok=True)
    test_db_path = os.path.join(target_dir, "ape.db")
    import shutil
    shutil.copy(db_path, test_db_path)
    os.chdir(old_cwd)

    proc = spawn_sidecar()
    try:
        yield proc
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
        try:
            os.remove(test_db_path)
        except OSError:
            pass


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
    assert resp["payload"]["error"] == "UNKNOWN_COMMAND"


def test_malformed_json(sidecar_proc):
    sidecar_proc.stdin.write("not json\n")
    sidecar_proc.stdin.flush()
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["ok"] is False
    assert resp["payload"]["error"] == "INVALID_REQUEST"


def test_create_sequence(sidecar_proc):
    msg_id = "test-create-seq"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "create_sequence",
            "payload": {"name": "sidecar_seq", "sequence": "ATGC", "topology": "circular"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "create_sequence"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "sidecar_seq"
    assert resp["payload"]["length_bp"] == 4


def test_save_as_dna(sidecar_proc):
    msg_id = "test-save-as-dna"
    target = r"C:\ApE\src-tauri\target\debug\saved_as_seq.dna"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_as_dna",
            "payload": {"name": "saved_as_seq", "sequence": "ATGC", "target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "save_as_dna"
    assert resp["ok"] is True
    assert os.path.exists(target)
    os.remove(target)


def test_save_as_fasta(sidecar_proc):
    msg_id = "test-save-as-fasta"
    target = r"C:\ApE\src-tauri\target\debug\saved_as_seq.fasta"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_as_fasta",
            "payload": {"name": "saved_fasta", "sequence": "AAAA", "target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "save_as_fasta"
    assert resp["ok"] is True
    assert os.path.exists(target)
    os.remove(target)


def test_save_as_gb(sidecar_proc):
    msg_id = "test-save-as-gb"
    target = r"C:\ApE\src-tauri\target\debug\saved_as_seq.gb"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_as_gb",
            "payload": {"name": "saved_gb", "sequence": "ACGT", "target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "save_as_gb"
    assert resp["ok"] is True
    assert os.path.exists(target)
    os.remove(target)


def test_open_sequence(sidecar_proc):
    msg_id = "test-open-sequence"
    target = r"C:\ApE\src-tauri\target\debug\saved_as_seq.dna"
    send(
        sidecar_proc,
        {
            "id": "prep-save-dna",
            "type": "request",
            "command": "save_as_dna",
            "payload": {"name": "open_target", "sequence": "GCTA", "target_path": target},
        },
    )
    prep = read(sidecar_proc)
    assert prep["ok"] is True

    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "open_sequence",
            "payload": {"target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "open_sequence"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "open_target"
    os.remove(target)


def test_list_sequences(sidecar_proc):
    msg_id = "test-list-sequences"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "list_sequences",
            "payload": {},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "list_sequences"
    assert resp["ok"] is True
    assert "sequences" in resp["payload"]


def test_deprecated_new_sequence(sidecar_proc):
    msg_id = "test-deprecated-new"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "new_sequence",
            "payload": {"name": "dep_seq", "sequence": "NNNN"},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["command"] == "new_sequence"
    assert resp["ok"] is True
    assert resp["payload"].get("deprecated") is True


def test_deprecated_save_dna(sidecar_proc):
    msg_id = "test-deprecated-save-dna"
    target = r"C:\ApE\src-tauri\target\debug\dep_save.dna"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_dna",
            "payload": {"name": "dep", "sequence": "N", "target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["command"] == "save_dna"
    assert resp["ok"] is True
    assert resp["payload"].get("deprecated") is True
    if os.path.exists(target):
        os.remove(target)


def test_deprecated_save_fasta(sidecar_proc):
    msg_id = "test-deprecated-save-fasta"
    target = r"C:\ApE\src-tauri\target\debug\dep_save.fasta"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_fasta",
            "payload": {"name": "dep", "sequence": "N", "target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["command"] == "save_fasta"
    assert resp["ok"] is True
    assert resp["payload"].get("deprecated") is True
    if os.path.exists(target):
        os.remove(target)


def test_deprecated_open_file(sidecar_proc):
    msg_id = "test-deprecated-open"
    target = r"C:\ApE\src-tauri\target\debug\dep_open.dna"
    send(
        sidecar_proc,
        {
            "id": "prep-dep-open",
            "type": "request",
            "command": "save_as_dna",
            "payload": {"name": "dep_open", "sequence": "GGG", "target_path": target},
        },
    )
    prep = read(sidecar_proc)
    assert prep["ok"] is True

    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "open_file",
            "payload": {"target_path": target},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["command"] == "open_file"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "dep_open"
    assert resp["payload"].get("deprecated") is True
    os.remove(target)


def test_create_construct(sidecar_proc_with_db):
    msg_id = "test-create-construct"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "MyConstruct", "sequence_id": 1},
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["id"] == msg_id
    assert resp["type"] == "response"
    assert resp["command"] == "create_construct"
    assert resp["ok"] is True
    assert resp["payload"]["name"] == "MyConstruct"
    assert "id" in resp["payload"]


def test_add_part_to_construct(sidecar_proc_with_db):
    create_id = "test-add-part-create"
    send(
        sidecar_proc_with_db,
        {
            "id": create_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "PartConstruct", "sequence_id": 1},
        },
    )
    create_resp = read(sidecar_proc_with_db)
    assert create_resp["ok"] is True
    construct_id = create_resp["payload"]["id"]

    msg_id = "test-add-part"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "add_part_to_construct",
            "payload": {
                "construct_id": construct_id,
                "part_id": "p001",
                "start": 0,
                "end": 100,
                "strand": 1,
                "color": "#ff0000",
                "order": 0,
            },
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["ok"] is True
    assert "id" in resp["payload"]


def test_save_construct(sidecar_proc_with_db):
    create_id = "test-save-construct-create"
    send(
        sidecar_proc_with_db,
        {
            "id": create_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "SaveConstruct", "sequence_id": 1},
        },
    )
    create_resp = read(sidecar_proc_with_db)
    assert create_resp["ok"] is True
    construct_id = create_resp["payload"]["id"]

    msg_id = "test-save-construct"
    target = r"C:\ApE\src-tauri\target\debug\construct.dna"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "save_construct",
            "payload": {"construct_id": construct_id, "target_path": target},
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["ok"] is True
    assert os.path.exists(target)
    os.remove(target)


def test_list_constructs(sidecar_proc):
    msg_id = "test-list-constructs"
    send(
        sidecar_proc,
        {
            "id": msg_id,
            "type": "request",
            "command": "list_constructs",
            "payload": {},
        },
    )
    resp = read(sidecar_proc)
    assert resp is not None
    assert resp["ok"] is True
    assert "constructs" in resp["payload"]


def test_open_construct(sidecar_proc_with_db):
    create_id = "test-open-construct-create"
    send(
        sidecar_proc_with_db,
        {
            "id": create_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "OpenConstruct", "sequence_id": 1},
        },
    )
    create_resp = read(sidecar_proc_with_db)
    assert create_resp["ok"] is True
    construct_id = create_resp["payload"]["id"]

    add_id = "test-open-construct-add"
    send(
        sidecar_proc_with_db,
        {
            "id": add_id,
            "type": "request",
            "command": "add_part_to_construct",
            "payload": {"construct_id": construct_id, "part_id": "p001", "start": 0, "end": 20, "strand": 1, "color": "#4caf50", "order": 0},
        },
    )
    add_resp = read(sidecar_proc_with_db)
    assert add_resp["ok"] is True
    part_id = add_resp["payload"]["id"]

    msg_id = "test-open-construct"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "open_construct",
            "payload": {"construct_id": construct_id},
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["ok"] is True
    assert resp["command"] == "open_construct"
    assert resp["payload"]["name"] == "OpenConstruct"
    parts = resp["payload"]["parts"]
    assert len(parts) == 1
    assert parts[0]["part_id"] == "p001"
    assert parts[0]["start"] == 0
    assert parts[0]["end"] == 20
    assert parts[0]["order"] == 0


def test_create_annotation(sidecar_proc_with_db):
    create_id = "test-create-annotation-construct"
    send(
        sidecar_proc_with_db,
        {
            "id": create_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "AnnotConstruct", "sequence_id": 1},
        },
    )
    create_resp = read(sidecar_proc_with_db)
    assert create_resp["ok"] is True
    construct_id = create_resp["payload"]["id"]

    add_id = "test-create-annotation-part"
    send(
        sidecar_proc_with_db,
        {
            "id": add_id,
            "type": "request",
            "command": "add_part_to_construct",
            "payload": {"construct_id": construct_id, "part_id": "p001", "start": 0, "end": 10, "strand": 1, "color": "#888", "order": 0},
        },
    )
    add_resp = read(sidecar_proc_with_db)
    assert add_resp["ok"] is True
    part_id = add_resp["payload"]["id"]

    msg_id = "test-create-annotation"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "create_annotation",
            "payload": {"construct_part_id": part_id, "name": "geneA", "feature_type": "gene", "start": 0, "end": 10, "strand": 1, "color": "#ff0000"},
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["ok"] is True
    assert resp["command"] == "create_annotation"
    assert resp["payload"]["id"] > 0


def test_list_annotations(sidecar_proc_with_db):
    create_id = "test-list-annotations-construct"
    send(
        sidecar_proc_with_db,
        {
            "id": create_id,
            "type": "request",
            "command": "create_construct",
            "payload": {"name": "ListAnnotConstruct", "sequence_id": 1},
        },
    )
    create_resp = read(sidecar_proc_with_db)
    assert create_resp["ok"] is True
    construct_id = create_resp["payload"]["id"]

    add_id = "test-list-annotations-part"
    send(
        sidecar_proc_with_db,
        {
            "id": add_id,
            "type": "request",
            "command": "add_part_to_construct",
            "payload": {"construct_id": construct_id, "part_id": "p001", "start": 0, "end": 10, "strand": 1, "color": "#888", "order": 0},
        },
    )
    add_resp = read(sidecar_proc_with_db)
    assert add_resp["ok"] is True
    part_id = add_resp["payload"]["id"]

    for name, feature_type, color in [("geneA", "gene", "#ff0000"), ("promB", "promoter", "#00ff00")]:
        msg_id = f"test-create-annotation-{name}"
        send(
            sidecar_proc_with_db,
            {
                "id": msg_id,
                "type": "request",
                "command": "create_annotation",
                "payload": {"construct_part_id": part_id, "name": name, "feature_type": feature_type, "start": 0, "end": 10, "strand": 1, "color": color},
            },
        )
        resp = read(sidecar_proc_with_db)
        assert resp["ok"] is True

    msg_id = "test-list-annotations"
    send(
        sidecar_proc_with_db,
        {
            "id": msg_id,
            "type": "request",
            "command": "list_annotations",
            "payload": {"construct_part_id": part_id},
        },
    )
    resp = read(sidecar_proc_with_db)
    assert resp is not None
    assert resp["ok"] is True
    assert resp["command"] == "list_annotations"
    annotations = resp["payload"]["annotations"]
    assert len(annotations) == 2
    names = {a["name"] for a in annotations}
    assert names == {"geneA", "promB"}
