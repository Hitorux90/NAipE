// src-tauri/src/main.rs — thin shim for `cargo tauri dev`.
//!
//! The real application lives in `lib.rs`.

#![allow(dead_code)]

fn main() {
    apetauri_lib::run();
}
