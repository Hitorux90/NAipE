# NAipE 0.1.0-alpha.1

First public alpha / early preview of NAipE — a desktop plasmid/DNA sequence editor built with Tauri v2, React, and a Python sidecar.

**This is an early-preview release. Please read the feature status below before relying on any specific tool.**

## What's new

- Initial public alpha release.
- Rebranded from "New ApE" to **NAipE**.
- Sequence viewer, restriction mapping, and primer/PCR design implemented and verified.
- Repository hygiene pass for public release: honest README, working CI, `.gitignore` cleanup.

## What's verified

The following features have been built, tested, and confirmed working:

- **Sequence viewer** — circular and linear plasmid maps.
- **Restriction mapping** — REBASE enzyme catalog, combined digest, gel ↔ map linkage.
- **Primer design & virtual PCR** — Tm/GC calculation, exact-scan `simulate_pcr`, circular topology support.

## What's known-unverified

These tools exist in the codebase and have unit tests, but have **not** been validated end-to-end. Treat them as in-progress, not production-ready:

- Alignment
- ORF finding
- Virtual assembly
- Biochemical properties
- Auto-annotation
- Motif search

## Test suite status

- Python sidecar (pytest): 70 passed, 4 skipped
- Frontend (Vitest): 77 passed / 20 files, 0 failed
- Rust (cargo test): 45 passed, 0 failed
- TypeScript build check (`tsc -b`): clean (exit 0)

## How to build

Requires Node.js, the Rust stable toolchain, and Python 3.12.

```powershell
$env:APEPYTHON = "<path to your Python 3.12 python.exe>"
cd C:\ApE
npm run tauri dev
```

See `README.md` for full build, run, and test instructions.

## License

MIT — see `LICENSE`.
