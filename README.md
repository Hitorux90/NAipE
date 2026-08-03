# NAipE — New AI Plasmid Editor

Tauri v2 + React desktop app for DNA sequence viewing, GenBank annotation, and parts library management.

## Stack

- **Desktop shell:** Tauri v2 (Rust)
- **Frontend:** React + TypeScript + Vite
- **Database:** SQLite via sqlx
- **Computation:** Python 3.12 NDJSON sidecar (persistent stdin/stdout process)

## Supported file formats

| Format | Extension | Read | Write |
|--------|-----------|------|-------|
| GenBank | `.gb` | ✅ Annotations, topology, sequence | ✅ |
| FASTA | `.fasta` | ✅ Sequence only | ✅ |
| ApE JSON | `.dna` | ✅ Legacy | ✅ |

## Current state

- **Visual:** 20-defect audit remediation complete — split-pane layout, token-based colors, nav rail (44px touch targets), full-width status bar, feature tiles with color-coded borders
- **Backend:** Sidecar health ping (`pong`), NDJSON protocol, GenBank parser with 26/26 pytest
- **Frontend:** `features` pipeline wired Python → Rust → TypeScript → React
- **Tests:** 26 Python (pytest), 12 Rust unit, 38 Vitest frontend
- **Known limitations:** Sidecar integration tests (3/6 pass — require live Python sidecar); no dark mode; no plugin system

## Quick start

```powershell
$env:APEPYTHON = "C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe"
cd C:\ApE
npm run tauri dev
```

## Test commands

```powershell
# Python sidecar (requires Python 3.12 with pytest installed)
& "C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe" -m pytest src-tauri\tests\sidecar_ndjson_smoke.py -v
# Expected: 26 passed

# Rust unit tests
cd C:\ApE\src-tauri && cargo test --test commands_rs_unit
# Expected: 12 passed

# Frontend tests
cd C:\ApE\src && npx vitest run
# Expected: 38 passed

# Full build check
cd C:\ApE\src-tauri && cargo check    # Rust: exit 0
cd C:\ApE\src && npx vite build        # Frontend: 1818 modules
```

## Vault

Full project documentation, technical history, and meta-lessons at:
`C:\DatosHermes\MiCerebro\50_Projects\NAipE\`

Start with **`09_Quick_Reference.md`** for canonical paths, constraints, and current state.

## Key recent fixes

| Commit | What |
|--------|------|
| `866f0f3` | Wire GenBank `features` through App.tsx (audit-driven) |
| `fd74f2a` | Add `features` field to Rust `Sequence` struct |
| `634e38e` | GenBank parser: preserve `/label`, `/note`, `/color` qualifiers |
| `bd219f9` | Fix CSS paths in `index.html` — 10 stylesheets silently broken |
| `9b9e0ba` | Sidecar health ping: `alive` → `pong` field match |