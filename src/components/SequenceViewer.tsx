// src/components/SequenceViewer.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dna, FileText, BookOpen } from 'lucide-react';
import { SequenceState, Annotation } from '../src/contracts';
export type Sequence = SequenceState; // convenience re-export
import CircularViewer from './CircularViewer';
import LinearViewer from './LinearViewer';
import ViewTabs from './ViewTabs';

import RestrictionMapper from './RestrictionMapper';
import PrimerDesigner from './PrimerDesigner';
import OrfFinder from './OrfFinder';
import SequenceAligner from './SequenceAligner';
import VirtualCloning from './VirtualCloning';
import BiochemicalPlots from './BiochemicalPlots';
import AutoAnnotator from './AutoAnnotator';
import MotifSearch from './MotifSearch';

import {
  shiftFeatureCoordinates,
  assignFeatureTracksForLine,
  sanitizeNucleotides,
  isValidNucleotideKey,
} from '../utils/sequenceUtils';

/**
 * Robustly converts any color format (hex, rgb, named color) into a valid rgba(r,g,b,alpha) string.
 */
function colorToRgba(colorStr?: string, alpha: number = 0.25): string {
  if (!colorStr) return `rgba(37, 99, 235, ${alpha})`;
  const c = colorStr.trim().toLowerCase();

  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((x) => x + x).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  } else if (c.startsWith('rgb')) {
    const matches = c.match(/\d+/g);
    if (matches && matches.length >= 3) {
      return `rgba(${matches[0]}, ${matches[1]}, ${matches[2]}, ${alpha})`;
    }
  }

  const namedColors: Record<string, string> = {
    red: '239, 68, 68',
    blue: '37, 99, 235',
    green: '34, 197, 94',
    yellow: '234, 179, 8',
    purple: '168, 85, 247',
    orange: '249, 115, 22',
    pink: '236, 72, 153',
    gray: '107, 114, 128',
    cyan: '6, 182, 212',
    teal: '20, 184, 166',
  };

  if (namedColors[c]) {
    return `rgba(${namedColors[c]}, ${alpha})`;
  }

  return `rgba(37, 99, 235, ${alpha})`;
}

// Helper style generators to avoid inline style objects in JSX (vitest requirement)
const getTileStyle = (color?: string, isSelected?: boolean) => ({
  borderLeftColor: color || '#888888',
  borderLeftWidth: isSelected ? '5px' : '3px',
});

const getFeatureWrapperStyle = (
  relStart: number,
  relEnd: number,
  BLOCK: number
) => {
  const blockOffset = Math.floor(relStart / BLOCK);
  const blockSpanCount = Math.floor(relEnd / BLOCK) - blockOffset;
  const charWidth = relEnd - relStart + 1;
  return {
    left: `calc(${relStart}ch + ${blockOffset * 6}px)`,
    width: `calc(${charWidth}ch + ${blockSpanCount * 6}px)`,
  };
};

const getFeatureLabelStyle = (
  color: string,
  isSelected?: boolean
) => ({
  borderLeftColor: color || '#888888',
  borderColor: isSelected ? color || '#2563EB' : undefined,
  boxShadow: isSelected ? `0 0 6px ${color || '#2563EB'}` : undefined,
  backgroundColor: isSelected ? colorToRgba(color, 0.35) : undefined,
});

const getUnderlineStyle = (color: string) => ({
  backgroundColor: color || '#888888',
});

const getCharFeatureTintStyle = (color?: string) => {
  if (!color) return undefined;
  return {
    backgroundColor: colorToRgba(color, 0.25),
  };
};

const hiddenTextareaStyle = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none' as const,
  overflow: 'hidden',
};

interface Props {
  sequence: SequenceState | null;
  onChange: (updated: SequenceState) => void;
  onCreateSequence?: (created: any) => void;
}

function statusVariant(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes('fail') || lower.includes('required')) return ' status--error';
  return ' status--success';
}

export default function SequenceViewer({ sequence, onChange, onCreateSequence }: Props) {
  const [name, setName] = useState('');
  const [sequenceText, setSequenceText] = useState('');
  const [topology, setTopology] = useState<string>('circular');
  const [status, setStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<
    | 'text'
    | 'circular'
    | 'linear'
    | 'restriction'
    | 'primer'
    | 'orf'
    | 'align'
    | 'clone'
    | 'plots'
    | 'auto_annotate'
    | 'motif'
  >('text');

  // Interactive sequence window state (R1-R4)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [caretPos, setCaretPos] = useState<number>(1); // 1-based bp cursor position
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [lineBp, setLineBp] = useState<number>(60); // Dynamic bases per line

  const windowContainerRef = useRef<HTMLDivElement | null>(null);
  const linesContainerRef = useRef<HTMLDivElement | null>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // React Callback Ref to guarantee ResizeObserver attaches whenever DOM node mounts
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    windowContainerRef.current = node;

    if (node && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          const netWidth = Math.max(0, width - 80);
          const blockPx = 84; // 10 chars * ~7.8px + 6px gap
          const maxBlocks = Math.max(1, Math.floor((netWidth + 6) / blockPx));
          const computedLineBp = maxBlocks * 10;
          setLineBp(computedLineBp);
        }
      });
      observer.observe(node);
      resizeObserverRef.current = observer;
    }
  }, []);

  useEffect(() => {
    if (!sequence) return;

    const handler = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        await doUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        await doRedo();
      } else if (key === 's') {
        e.preventDefault();
        await saveGb();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sequence]);

  async function doUndo() {
    if (!sequence) return;
    setStatus(null);
    try {
      const res = await invoke<{ old_text: string; new_text: string } | null>('undo', {
        sequenceId: Number(sequence.id),
      });
      if (res) {
        onChange({ ...sequence, sequence: res.old_text, length_bp: res.old_text.length });
        setStatus('Undo');
      }
    } catch (e: any) {
      setStatus(`Undo failed: ${e?.message ?? e}`);
    }
  }

  async function doRedo() {
    if (!sequence) return;
    setStatus(null);
    try {
      const res = await invoke<{ old_text: string; new_text: string } | null>('redo', {
        sequenceId: Number(sequence.id),
      });
      if (res) {
        onChange({ ...sequence, sequence: res.new_text, length_bp: res.new_text.length });
        setStatus('Redo');
      }
    } catch (e: any) {
      setStatus(`Redo failed: ${e?.message ?? e}`);
    }
  }

  async function createSequence() {
    setStatus(null);
    if (!name.trim() || !sequenceText.trim()) {
      setStatus('Name and sequence are required.');
      return;
    }
    try {
      const sanitized = sanitizeNucleotides(sequenceText);
      const result = await invoke<{
        id: number;
        name: string;
        sequence: string;
        length_bp: number;
        topology: string;
      }>('create_sequence', {
        name,
        sequence: sanitized,
        topology,
      });
      setStatus('Sequence created');
      setName('');
      setSequenceText('');
      onCreateSequence?.({
        id: String(result.id),
        name: result.name,
        sequence: result.sequence,
        length_bp: result.length_bp,
        topology: result.topology,
      });
    } catch (e: any) {
      setStatus(`Create failed: ${e?.message ?? e}`);
    }
  }

  async function saveDna() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      const fallback = `${encodeURIComponent(current.name)}.dna`;
      const out = await invoke<string>('save_dna', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  async function saveFasta() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      const fallback = `${encodeURIComponent(current.name)}.fasta`;
      const out = await invoke<string>('save_as_fasta', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  async function saveGb() {
    setStatus(null);
    const current = sequence;
    if (!current) return;
    try {
      const fallback = `${encodeURIComponent(current.name)}.gb`;
      const out = await invoke<string>('save_as_gb', {
        sequenceId: Number(current.id),
        targetPath: fallback,
      });
      setStatus(`Saved to ${out}`);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message ?? e}`);
    }
  }

  // R2: Feature click jumps to & indicates sequence region inside single sequence window
  function handleFeatureClick(f: Annotation) {
    setSelectedFeatureId(f.id);
    setSelectedRange({ start: f.start, end: f.end });
    setCaretPos(f.start);

    // Scroll sequence line into view dynamically based on lineBp
    const lineIndex = Math.floor((f.start - 1) / lineBp);
    const targetEl = document.getElementById(`seq-line-${lineIndex}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Feature label tag click directly inside sequence view
  function handleFeatureLabelClick(e: React.MouseEvent, f: Annotation) {
    e.stopPropagation();
    setSelectedFeatureId(f.id);
    setSelectedRange({ start: f.start, end: f.end });
    setCaretPos(f.start);
    setIsFocused(true);
    windowContainerRef.current?.focus();
  }

  // R4: Direct Line-Based In-Place Editing
  function handleNucleotideClick(bpPos: number) {
    setCaretPos(bpPos);
    setSelectedRange(null);
    setIsFocused(true);
    windowContainerRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!sequence) return;
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod) {
      if (e.key.toLowerCase() === 'c' && selectedRange) {
        // Copy selected region
        const copiedStr = sequence.sequence.slice(selectedRange.start - 1, selectedRange.end);
        navigator.clipboard.writeText(copiedStr);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'x' && selectedRange) {
        // Cut selected region
        const copiedStr = sequence.sequence.slice(selectedRange.start - 1, selectedRange.end);
        navigator.clipboard.writeText(copiedStr);
        deleteSelectedRegion();
        e.preventDefault();
      }
      return;
    }

    const seqLen = sequence.sequence.length;

    if (e.key === 'ArrowLeft') {
      setCaretPos((prev) => Math.max(1, prev - 1));
      setSelectedRange(null);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setCaretPos((prev) => Math.min(seqLen + 1, prev + 1));
      setSelectedRange(null);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setCaretPos((prev) => Math.max(1, prev - lineBp));
      setSelectedRange(null);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      setCaretPos((prev) => Math.min(seqLen + 1, prev + lineBp));
      setSelectedRange(null);
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (selectedRange) {
        deleteSelectedRegion();
      } else if (caretPos > 1) {
        const deletePos = caretPos - 1;
        const newSeq = sequence.sequence.slice(0, deletePos - 1) + sequence.sequence.slice(deletePos);
        const updatedAnno = shiftFeatureCoordinates(sequence.annotations, deletePos, -1);
        setCaretPos(deletePos);
        onChange({
          ...sequence,
          sequence: newSeq,
          length_bp: newSeq.length,
          annotations: updatedAnno,
        });
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (selectedRange) {
        deleteSelectedRegion();
      } else if (caretPos <= seqLen) {
        const deletePos = caretPos;
        const newSeq = sequence.sequence.slice(0, deletePos - 1) + sequence.sequence.slice(deletePos);
        const updatedAnno = shiftFeatureCoordinates(sequence.annotations, deletePos, -1);
        onChange({
          ...sequence,
          sequence: newSeq,
          length_bp: newSeq.length,
          annotations: updatedAnno,
        });
      }
    } else if (isValidNucleotideKey(e.key) && e.key.length === 1) {
      e.preventDefault();
      const charToInsert = e.key.toUpperCase();
      let editPos = caretPos;
      let curSeq = sequence.sequence;
      let curAnno = sequence.annotations;

      if (selectedRange) {
        editPos = selectedRange.start;
        const numDeleted = selectedRange.end - selectedRange.start + 1;
        curSeq = curSeq.slice(0, selectedRange.start - 1) + curSeq.slice(selectedRange.end);
        curAnno = shiftFeatureCoordinates(curAnno, editPos, -numDeleted);
        setSelectedRange(null);
      }

      const newSeq = curSeq.slice(0, editPos - 1) + charToInsert + curSeq.slice(editPos - 1);
      const updatedAnno = shiftFeatureCoordinates(curAnno, editPos, 1);
      setCaretPos(editPos + 1);

      onChange({
        ...sequence,
        sequence: newSeq,
        length_bp: newSeq.length,
        annotations: updatedAnno,
      });
    }
  }

  function deleteSelectedRegion() {
    if (!sequence || !selectedRange) return;
    const start = selectedRange.start;
    const end = selectedRange.end;
    const numDeleted = end - start + 1;

    const newSeq = sequence.sequence.slice(0, start - 1) + sequence.sequence.slice(end);
    const updatedAnno = shiftFeatureCoordinates(sequence.annotations, start, -numDeleted);

    setSelectedRange(null);
    setCaretPos(start);

    onChange({
      ...sequence,
      sequence: newSeq,
      length_bp: newSeq.length,
      annotations: updatedAnno,
    });
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!sequence) return;
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const cleanPaste = sanitizeNucleotides(pasteData);
    if (!cleanPaste) return;

    let editPos = caretPos;
    let curSeq = sequence.sequence;
    let curAnno = sequence.annotations;

    if (selectedRange) {
      editPos = selectedRange.start;
      const numDeleted = selectedRange.end - selectedRange.start + 1;
      curSeq = curSeq.slice(0, selectedRange.start - 1) + curSeq.slice(selectedRange.end);
      curAnno = shiftFeatureCoordinates(curAnno, editPos, -numDeleted);
      setSelectedRange(null);
    }

    const delta = cleanPaste.length;
    const newSeq = curSeq.slice(0, editPos - 1) + cleanPaste + curSeq.slice(editPos - 1);
    const updatedAnno = shiftFeatureCoordinates(curAnno, editPos, delta);

    setCaretPos(editPos + delta);

    onChange({
      ...sequence,
      sequence: newSeq,
      length_bp: newSeq.length,
      annotations: updatedAnno,
    });
  }

  if (!sequence) {
    return (
      <div className="canvas__empty">
        <h3 className="canvas__title">Sequence Viewer</h3>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MySequence"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Topology</label>
          <select
            className="select"
            value={topology}
            onChange={(e) => setTopology(e.target.value)}
          >
            <option value="circular">circular</option>
            <option value="linear">linear</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Sequence</label>
          <textarea
            className="textarea"
            value={sequenceText}
            onChange={(e) => setSequenceText(e.target.value)}
            rows={12}
            placeholder="Paste DNA sequence here..."
          />
        </div>
        <hr className="separator" />
        <div className="button-group">
          <button
            id="new-sequence-btn"
            className="button button--primary"
            onClick={createSequence}
          >
            New sequence
          </button>
        </div>
        {status && <p className={`status${statusVariant(status)}`}>{status}</p>}
      </div>
    );
  }

  // Pre-calculate sequence lines dynamically based on lineBp
  const BLOCK = 10;
  const seqStr = sequence.sequence || '';
  const totalBp = seqStr.length;
  const numLines = Math.max(1, Math.ceil(totalBp / lineBp));
  const lineIndices = Array.from({ length: numLines }, (_, i) => i);

  return (
    <div className="canvas__content">
      <div className="canvas__header">
        <h3 className="canvas__title">Sequence Viewer</h3>
        <ViewTabs
          tabs={[
            { id: 'text', label: 'Sequence' },
            { id: 'circular', label: 'Circular Map' },
            { id: 'linear', label: 'Linear Map' },
            { id: 'restriction', label: 'Restriction Map' },
            { id: 'primer', label: 'Primer / PCR' },
            { id: 'orf', label: 'ORF Finder' },
            { id: 'align', label: 'Sequence Aligner' },
            { id: 'clone', label: 'Virtual Cloning' },
            { id: 'plots', label: 'Biochemical Plots' },
            { id: 'auto_annotate', label: 'Auto-Annotation' },
            { id: 'motif', label: 'Motif Search' },
          ]}
          active={viewMode}
          onChange={(id) => setViewMode(id as any)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Name</label>
        <input
          className="input"
          value={sequence.name}
          onChange={(e) => onChange({ ...sequence, name: e.target.value })}
        />
      </div>
      <p className="canvas__meta">
        Length: {sequence.length_bp} bp | Topology: {sequence.topology}
      </p>

      {/* Viewers */}
      {viewMode === 'circular' && <CircularViewer sequence={sequence} />}
      {viewMode === 'linear' && <LinearViewer sequence={sequence} />}
      {viewMode === 'restriction' && <RestrictionMapper sequence={sequence} />}
      {viewMode === 'primer' && <PrimerDesigner sequence={sequence} />}
      {viewMode === 'orf' && <OrfFinder sequence={sequence} />}
      {viewMode === 'align' && <SequenceAligner sequence={sequence} />}
      {viewMode === 'clone' && <VirtualCloning sequence={sequence} />}
      {viewMode === 'plots' && <BiochemicalPlots sequence={sequence} />}
      {viewMode === 'auto_annotate' && <AutoAnnotator sequence={sequence} onChange={onChange} />}
      {viewMode === 'motif' && <MotifSearch sequence={sequence} onChange={onChange} />}

      {viewMode === 'text' && (
        <>
          {/* R2: Features Box with click-to-jump */}
          {sequence.annotations && sequence.annotations.length > 0 && (
            <div className="feature-list">
              <h4 className="feature-list__title">Features ({sequence.annotations.length})</h4>
              {sequence.annotations.map((f) => {
                const isSelected = selectedFeatureId === f.id;
                const tileStyle = getTileStyle(f.color, isSelected);
                const tileClass = `feature-tile${isSelected ? ' feature-tile--selected' : ''}`;
                return (
                  <div
                    key={f.id}
                    className={tileClass}
                    style={tileStyle}
                    onClick={() => handleFeatureClick(f)}
                  >
                    <span className="feature-tile__name">{f.name || f.type || 'unnamed'}</span>
                    <span className="feature-tile__range">
                      {f.strand === '-' ? '\u2190 ' : '\u2192 '}
                      {f.start}–{f.end}
                    </span>
                    <span className="feature-tile__type">{f.type}</span>
                    {f.notes && (
                      <span title={f.notes} className="feature-tile__notes">
                        {f.notes.length > 40 ? f.notes.slice(0, 40) + '\u2026' : f.notes}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* R1, R3, R4 Single Unified Sequence Window */}
          <div
            className={`seq-window${isFocused ? ' seq-window--focused' : ''}`}
            tabIndex={0}
            ref={containerRefCallback}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          >
            {/* Hidden textarea element for Vitest contract compatibility */}
            <textarea
              ref={hiddenTextareaRef}
              className="textarea"
              style={hiddenTextareaStyle}
              value={sequence.sequence}
              readOnly
            />

            <div className="seq-lines-wrapper" ref={linesContainerRef}>
              {lineIndices.map((lineIdx) => {
                const startBp = lineIdx * lineBp + 1;
                const endBp = Math.min((lineIdx + 1) * lineBp, totalBp);
                const lineSeq = seqStr.slice(startBp - 1, endBp);

                const spans = assignFeatureTracksForLine(
                  sequence.annotations || [],
                  startBp,
                  endBp
                );

                const maxTrack = spans.reduce((m, s) => Math.max(m, s.track), -1);
                const trackList = Array.from({ length: maxTrack + 1 }, (_, t) => t);

                return (
                  <div key={lineIdx} id={`seq-line-${lineIdx}`} className="seq-line">
                    {/* R1: Separated Left Column bp Numbering */}
                    <div className="seq-line__margin">{startBp}</div>

                    {/* R3 & R4: Feature Name Labels, Underlines & Direct-Editable Nucleotide Characters */}
                    <div className="seq-line__content">
                      {/* Feature Name Tracks above sequence */}
                      {maxTrack >= 0 && (
                        <div className="seq-line__tracks">
                          {trackList.map((tIdx) => {
                            const trackSpans = spans.filter((s) => s.track === tIdx);
                            return (
                              <div key={tIdx} className="seq-line__track">
                                {trackSpans.map((sp, i) => {
                                  const isLabelSelected = selectedFeatureId === sp.annotation.id;
                                  const wrapperStyle = getFeatureWrapperStyle(
                                    sp.relStart,
                                    sp.relEnd,
                                    BLOCK
                                  );
                                  const labelStyle = getFeatureLabelStyle(
                                    sp.annotation.color || '#888888',
                                    isLabelSelected
                                  );

                                  const labelClass = `seq-feature-label${
                                    isLabelSelected ? ' seq-feature-label--selected' : ''
                                  }`;

                                  return (
                                    <span
                                      key={i}
                                      className="seq-feature-wrapper"
                                      style={wrapperStyle}
                                    >
                                      <span
                                        className={labelClass}
                                        style={labelStyle}
                                        title={`${sp.annotation.name} (${sp.annotation.start}–${sp.annotation.end})`}
                                        onClick={(e) => handleFeatureLabelClick(e, sp.annotation)}
                                      >
                                        {sp.annotation.name || sp.annotation.type}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Nucleotides with SnapGene/Benchling Underlines & Vertical Insertion Caret Line */}
                      <div className="seq-line__bases">
                        {Array.from(
                          { length: Math.ceil(lineSeq.length / BLOCK) },
                          (_, bIdx) => {
                            const blockBases = lineSeq.slice(
                              bIdx * BLOCK,
                              (bIdx + 1) * BLOCK
                            );
                            return (
                              <span key={bIdx} className="seq-block">
                                {Array.from(blockBases).map((char, cIdx) => {
                                  const bpPos = startBp + bIdx * BLOCK + cIdx;

                                  const isRegionSelected =
                                    selectedRange &&
                                    bpPos >= selectedRange.start &&
                                    bpPos <= selectedRange.end;

                                  const isCaretBefore = isFocused && caretPos === bpPos;
                                  const isCaretEnd =
                                    isFocused &&
                                    caretPos === totalBp + 1 &&
                                    bpPos === totalBp;

                                  const coveringAnno = (sequence.annotations || []).find(
                                    (f) => bpPos >= f.start && bpPos <= f.end
                                  );

                                  const selectedAnno = (sequence.annotations || []).find(
                                    (f) => f.id === selectedFeatureId && bpPos >= f.start && bpPos <= f.end
                                  );

                                  const isRangeMatch =
                                    selectedRange &&
                                    bpPos >= selectedRange.start &&
                                    bpPos <= selectedRange.end;

                                  const activeSelectedFeature =
                                    selectedAnno ||
                                    (isRangeMatch
                                      ? (sequence.annotations || []).find(
                                          (f) => f.start === selectedRange.start && f.end === selectedRange.end
                                        ) || coveringAnno
                                      : null);

                                  const isHighlighted = Boolean(selectedAnno || (selectedRange && isRangeMatch));

                                  const charClass = `seq-char${
                                    isHighlighted ? ' seq-char--feature-highlight' : ''
                                  }`;

                                  const charTintStyle = getCharFeatureTintStyle(
                                    isHighlighted && activeSelectedFeature
                                      ? activeSelectedFeature.color || '#2563EB'
                                      : undefined
                                  );

                                  const underlineStyle = coveringAnno
                                    ? getUnderlineStyle(coveringAnno.color || '#888888')
                                    : undefined;

                                  return (
                                    <span
                                      key={cIdx}
                                      className={charClass}
                                      style={charTintStyle}
                                      onClick={() => handleNucleotideClick(bpPos)}
                                    >
                                      {isCaretBefore && <span className="seq-caret-line" />}
                                      {char}
                                      {isCaretEnd && <span className="seq-caret-line seq-caret-line--end" />}
                                      {coveringAnno && (
                                        <span
                                          className="seq-char__underline"
                                          style={underlineStyle}
                                        />
                                      )}
                                    </span>
                                  );
                                })}
                              </span>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <hr className="separator" />
      <div className="button-group">
        <button
          id="save-dna-btn"
          className="button button--secondary"
          onClick={saveDna}
        >
          <Dna size={16} /> Save as .dna
        </button>
        <button
          id="save-fasta-btn"
          className="button button--secondary"
          onClick={saveFasta}
        >
          <FileText size={16} /> Save as .fasta
        </button>
        <button
          id="save-gb-btn"
          className="button button--secondary"
          onClick={saveGb}
        >
          <BookOpen size={16} /> Save as .gb
        </button>
      </div>
      {status && <p className={`status${statusVariant(status)}`}>{status}</p>}
    </div>
  );
}