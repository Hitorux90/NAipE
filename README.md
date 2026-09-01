# NAipE — New AI Plasmid Editor

A desktop plasmid/DNA sequence editor built with Tauri v2 (Rust), React + TypeScript, and a Python NDJSON sidecar for sequence computation.

> **Status: alpha / early preview.** This is a public repository release for visibility and early feedback, not a finished product. See the feature status table below before relying on anything.

## Feature status

**Verified & client-confirmed** — these have been built, tested, and confirmed working by the project owner:

| Feature | Description |
|---|---|
| Sequence viewer | Circular and linear plasmid maps |
| Restriction mapping | REBASE enzyme catalog, combined digest, gel ↔ map linkage |
| Primer design & virtual PCR | Tm/GC calculation, exact-scan `simulate_pcr`, circular topology support |

**Present in the codebase but UNVERIFIED / in progress** — these tools exist and have unit tests, but have not been validated end-to-end or confirmed by the project owner. **Do not rely on them yet:**

| Feature | Status |
|---|---|
| Alignment | unverified — do not rely on it yet |
| ORF finding | unverified — do not rely on it yet |
| Virtual assembly | unverified — do not rely on it yet |
| Biochemical properties | unverified — do not rely on it yet |
| Auto-annotation | unverified — do not rely on it yet |
| Motif search | unverified — do not rely on it yet |

## Stack

- **Desktop shell:** Tauri v2 (Rust)
- **Frontend:** React + TypeScript + Vite
- **Database:** SQLite via sqlx
- **Computation:** Python 3.12 NDJSON sidecar (persistent stdin/stdout process, `src-tauri/sidecar/`)

## Supported file formats

| Format | Extension | Read | Write |
|--------|-----------|------|-------|
| GenBank | `.gb` | ✅ Annotations, topology, sequence | ✅ |
| FASTA | `.fasta` | ✅ Sequence only | ✅ |
| ApE JSON | `.dna` | ✅ Legacy | ✅ |

## Build & run (Windows)

Requires Node.js, Rust (stable toolchain), and Python 3.12.

```powershell
# Point the app at your Python 3.12 interpreter
$env:APEPYTHON = "<path to your Python 3.12 python.exe>"

cd C:\ApE
npm run tauri dev
```

The frontend lives in `src/` (its own `package.json` with the Vite/React toolchain); the repo-root `package.json` is a thin wrapper that forwards `npm run dev` / `npm run build` into `src/`.

## Test commands

```powershell
# Python sidecar tests (pytest)
& "<path to your Python 3.12 python.exe>" -m pytest src-tauri\tests\ -q
# Expected: 70 passed, 4 skipped

# If your shell has a PYTHONPATH set that conflicts with the project's sidecar
# imports (e.g. from another Python dev environment), clear it first:
#   Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

# Frontend tests (Vitest)
cd C:\ApE\src
npx vitest run
# Expected: 77 passed / 20 files, 0 failed

# Rust tests (PowerShell)
cd C:\ApE\src-tauri
cargo test
# Expected: 45 passed, 0 failed

# TypeScript build check
cd C:\ApE\src
npx tsc -b
# Expected: exit 0, no errors
```

> Clearing `PYTHONPATH` (above) is only needed if your local shell has one set that conflicts with the project's sidecar imports (e.g. from another Python-based dev environment). CI runs plain `pytest` since it has no inherited `PYTHONPATH`.

## Screenshots

<!-- TODO: add screenshots -->

## License

[MIT](LICENSE) — Copyright (c) 2026 NAipE contributors

**Status:** alpha / early preview.
