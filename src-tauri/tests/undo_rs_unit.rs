// src-tauri/tests/undo_rs_unit.rs
//! Unit tests for the in-memory undo/redo stack.
//! Exercises push, undo, redo, and max-depth behavior.

use apetauri_lib::undo::{UndoManager, UndoEntry};

fn make_entry(start: usize, old_text: impl Into<String>, new_text: impl Into<String>) -> UndoEntry {
    UndoEntry {
        action_type: "sequence".into(),
        action: "replace".into(),
        start,
        old_text: old_text.into(),
        new_text: new_text.into(),
        timestamp_ms: 123,
        payload: serde_json::json!({}),
    }
}

fn make_assembly_entry(action: &str, payload: serde_json::Value) -> UndoEntry {
    UndoEntry {
        action_type: "assembly".into(),
        action: action.into(),
        start: 0,
        old_text: String::new(),
        new_text: String::new(),
        timestamp_ms: 123,
        payload,
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

#[test]
fn test_assembly_undo_redo_cycle() {
    let mut manager = UndoManager::new();
    manager.push(1, make_assembly_entry("add_part", serde_json::json!({"part_id": "p001", "start": 0, "end": 20})));
    manager.push(1, make_assembly_entry("add_part", serde_json::json!({"part_id": "p002", "start": 20, "end": 29})));

    let first = manager.undo(1).expect("undo add_part");
    assert_eq!(first.action, "add_part");
    assert_eq!(first.payload.get("part_id").and_then(|v| v.as_str()), Some("p002"));

    let restored = manager.redo(1).expect("redo add_part");
    assert_eq!(restored.action, "add_part");
    assert_eq!(restored.payload.get("part_id").and_then(|v| v.as_str()), Some("p002"));
}

#[test]
fn test_assembly_undo_does_not_affect_sequence_undo() {
    let mut manager = UndoManager::new();
    manager.push(1, make_entry(0, "A", "G"));
    manager.push(1, make_assembly_entry("add_part", serde_json::json!({"part_id": "p001"})));

    assert!(manager.can_undo(1));
    let first = manager.undo(1).expect("undo assembly");
    assert_eq!(first.action, "add_part");
    assert!(manager.can_undo(1), "sequence undo should still be available after assembly undo");
    assert!(manager.can_redo(1));
}
