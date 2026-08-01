// src-tauri/tests/undo_rs_unit.rs
//! Unit tests for the in-memory undo/redo stack.
//! Exercises push, undo, redo, and max-depth behavior.

use apetauri_lib::undo::{UndoManager, UndoEntry};

fn make_entry(start: usize, old_text: impl Into<String>, new_text: impl Into<String>) -> UndoEntry {
    UndoEntry {
        action: "replace".into(),
        start,
        old_text: old_text.into(),
        new_text: new_text.into(),
        timestamp_ms: 123,
    }
}

#[test]
fn test_undo_redo_cycle() {
    let mut manager = UndoManager::new();
    manager.push(1, make_entry(0, "A", "G"));
    manager.push(1, make_entry(1, "C", "T"));

    let first = manager.undo(1).expect("first undo");
    assert_eq!(first.old_text, "C");
    assert_eq!(first.new_text, "T");

    let second = manager.undo(1).expect("second undo");
    assert_eq!(second.old_text, "A");
    assert_eq!(second.new_text, "G");

    let restored = manager.redo(1).expect("first redo");
    assert_eq!(restored.old_text, "A");
    assert_eq!(restored.new_text, "G");
}

#[test]
fn test_max_depth_trims_oldest() {
    let mut manager = UndoManager::new();
    for i in 0..101 {
        manager.push(1, make_entry(i, format!("old{i}"), format!("new{i}")));
    }
    assert_eq!(manager.undo(1).expect("undo").old_text, "old100");
    for _ in 0..99 {
        manager.undo(1).expect("undo remains");
    }
    assert!(manager.undo(1).is_none());
}

#[test]
fn test_redo_clears_after_new_push() {
    let mut manager = UndoManager::new();
    manager.push(1, make_entry(0, "A", "G"));
    manager.undo(1);
    manager.push(1, make_entry(1, "C", "T"));
    assert!(manager.redo(1).is_none());
}

#[test]
fn test_per_sequence_isolation() {
    let mut manager = UndoManager::new();
    manager.push(1, make_entry(0, "A", "G"));
    manager.push(2, make_entry(0, "X", "Y"));

    assert!(manager.can_undo(1));
    assert!(manager.can_undo(2));
    assert!(!manager.can_redo(1));

    manager.undo(1);
    assert!(!manager.can_undo(1));
    assert!(manager.can_undo(2));
}
