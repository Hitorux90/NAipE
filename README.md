# ApE — New AI Plasmid Editor

Minimal Tauri + React app for sequence and parts management.

## Stack
- Rust / Tauri v2
- React + TypeScript + Vite
- SQLite via sqlx
- Python NDJSON sidecar

## Quick start
```powershell
cd C:\ApE
npm install
npm run tauri dev
```

## Tests
```powershell
cd C:\ApE\src-tauri && cargo test --test sidecar_rs_unit
cd C:\ApE\src-tauri && cargo test --test commands_rs_unit
cd C:\ApE && python -m pytest src-tauri\tests\sidecar_ndjson_smoke.py -v
cd C:\ApE\src && npx vitest run
```
