# Changelog

All notable changes to NAipE are documented in this file.

## [0.1.0-alpha.1] — 2026-09-01

Initial public alpha / early preview.

### Verified & client-confirmed

- **Sequence viewer** — circular and linear plasmid maps.
- **Restriction mapping** — REBASE enzyme catalog, combined digest, gel ↔ map linkage.
- **Primer design & virtual PCR** — Tm/GC calculation, exact-scan `simulate_pcr`, circular topology support.

### Present in the codebase but unverified / in progress

The following tools exist in the codebase with unit tests, but have not been validated end-to-end or confirmed by the project owner. They should not be relied on yet:

- Alignment
- ORF finding
- Virtual assembly
- Biochemical properties
- Auto-annotation
- Motif search

### Other

- Rebranded the project from "New ApE" to **NAipE**.
- Repository hygiene pass for public release (`.gitignore`, README, CI).

### Test status at this release

- Python sidecar (pytest): 70 passed, 4 skipped
- Frontend (Vitest): 77 passed / 20 files, 0 failed
- Rust (cargo test): 45 passed, 0 failed
- TypeScript build check (`tsc -b`): clean (exit 0)
