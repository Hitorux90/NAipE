// src-tauri/src/undo.rs
// In-memory undo/redo stack, Rust-owned, not persisted to disk.
// Per-sequence stacks with max depth 100.

use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UndoEntry {
    pub action: String,
    pub start: usize,
    pub old_text: String,
    pub new_text: String,
    pub timestamp_ms: i64,
}

#[derive(Debug)]
pub struct UndoStack {
    pub undo: Vec<UndoEntry>,
    pub redo: Vec<UndoEntry>,
    pub max_depth: usize,
}

impl UndoStack {
    pub fn new(max_depth: usize) -> Self {
        Self {
            undo: Vec::new(),
            redo: Vec::new(),
            max_depth,
        }
    }

    pub fn push(&mut self, entry: UndoEntry) {
        self.undo.push(entry);
        if self.undo.len() > self.max_depth {
            self.undo.remove(0);
        }
        self.redo.clear();
    }

    pub fn undo(&mut self) -> Option<UndoEntry> {
        self.undo.pop()
    }

    pub fn redo(&mut self) -> Option<UndoEntry> {
        self.redo.pop()
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
}

#[derive(Debug, Default)]
pub struct UndoManager {
    stacks: HashMap<i64, UndoStack>,
}

impl UndoManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_or_create(&mut self, sequence_id: i64) -> &mut UndoStack {
        self.stacks.entry(sequence_id).or_insert_with(|| UndoStack::new(100))
    }

    pub fn push(&mut self, sequence_id: i64, entry: UndoEntry) {
        self.get_or_create(sequence_id).push(entry);
    }

    pub fn undo(&mut self, sequence_id: i64) -> Option<UndoEntry> {
        let entry = self.get_or_create(sequence_id).undo();
        if let Some(ref e) = entry {
            self.get_or_create(sequence_id).redo.push(e.clone());
        }
        entry
    }

    pub fn redo(&mut self, sequence_id: i64) -> Option<UndoEntry> {
        let entry = self.get_or_create(sequence_id).redo();
        if let Some(ref e) = entry {
            self.get_or_create(sequence_id).undo.push(e.clone());
        }
        entry
    }

    pub fn can_undo(&self, sequence_id: i64) -> bool {
        self.stacks.get(&sequence_id).map_or(false, |s| s.can_undo())
    }

    pub fn can_redo(&self, sequence_id: i64) -> bool {
        self.stacks.get(&sequence_id).map_or(false, |s| s.can_redo())
    }
}
