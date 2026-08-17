// components/LinearViewer.tsx
// Canvas-based linear sequence viewer — rebuilt per Step 0 of the remediation plan.
// Replaces the previous SVG implementation.
import { useRef, useEffect, useCallback, useState } from 'react';
import { SequenceState, Annotation, DigestCut } from '../src/contracts';

interface Props {
  sequence: SequenceState;
  restrictionCuts?: DigestCut[];
  restrictionSelectedEnzymes?: string[];
  onCutClick?: (cut: DigestCut) => void;
}

/* ── R4: stable per-enzyme color assignment for restriction cut-site marks ── */
const ENZYME_COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];
function enzymeColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return ENZYME_COLOR_PALETTE[hash % ENZYME_COLOR_PALETTE.length];
}
const CUT_HIT_RADIUS = 8; // screen px hit-test radius for hover/click on a cut marker

/* ── Layout constants (world-space px at scale = 1) ────────────────────────── */
const WORLD_W       = 1000;  // full sequence maps to [0, WORLD_W] in world x
const LANE_H        = 14;    // feature rect height (world px)
const LANE_GAP      = 8;     // gap between lanes; and between lane-0 and backbone
const RULER_OFFSET  = 28;    // y below backbone where tick ends (world px)
const TICK_H        = 8;     // tick height above RULER_OFFSET start (world px)

/* ── Label density gate (screen-space) ───────────────────────────────────── */
const MIN_FEATURE_PX = 22; // screen px span of feature before label appears

/* ── Annotation type priority (lower = more important = appears first) ─────── */
const TYPE_PRIORITY: Record<string, number> = {
  gene:             1,
  CDS:              2,
  mRNA:             3,
  promoter:         4,
  primer_bind:      5,
  primer:           5,
  terminator:       6,
  rep_origin:       7,
  regulatory:       8,
  RBS:              9,
  'sig_peptide':    10,
  'transit_peptide':11,
  'misc_RNA':       12,
  'misc_feature':   13,
  'repeat_region':  14,
  restriction_site: 15,
  site:             15,
  misc_binding:     16,
};
const DEFAULT_PRIORITY = 99;

function typePriority(type: string): number {
  return TYPE_PRIORITY[type] ?? DEFAULT_PRIORITY;
}

/* ── Label/ruler constants (screen-space) ───────────────────────────────────── */
const LABEL_FONT_PX   = 11;   // feature labels
const RULER_FONT_PX   = 9;    // bp tick labels
const BASE_FONT_PX    = 10;   // single-base display
const BASE_SHOW_THR   = 8;    // screen px per base before showing individual bases
const LABEL_PAD_X     = 3;
const LABEL_PAD_Y     = 2;
const LEADER_DOT_R    = 2.5;
const LEADER_GAP      = 5;
const MAX_LABEL_CHARS = 22;
const LABEL_BUMP_PX   = LABEL_FONT_PX + 4; // screen px to bump a colliding label upward

/* ── Viewport ────────────────────────────────────────────────────────────────── */
const MIN_SCALE  = 0.10;
const MAX_SCALE  = 600.0;   // high ceiling allows base-level detail
const ZOOM_STEP  = 1.20;
const SIDE_PAD   = 32;      // initial logical px margin on each side of the sequence

/* ── Tick intervals in bp ───────────────────────────────────────────────────── */
const TICK_INTERVALS = [
  1, 5, 10, 25, 50, 100, 250, 500,
  1000, 2500, 5000, 10000, 25000, 50000,
  100000, 250000, 500000, 1000000,
];

/* ── Greedy lane assignment: returns Map<annotation.id, lane_index> ─────────── */
function assignLanes(anns: Annotation[]): Map<string, number> {
  const sorted    = [...anns].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const map       = new Map<string, number>();
  for (const ann of sorted) {
    let lane = laneEnds.findIndex((e) => e <= ann.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = ann.end;
    map.set(ann.id, lane);
  }
  return map;
}

export default function LinearViewer({
  sequence,
  restrictionCuts,
  restrictionSelectedEnzymes,
  onCutClick,
}: Props) {
  const wrapRef    = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const seqRef     = useRef(sequence);
  const scaleRef   = useRef(1.0);
  const panRef     = useRef({ x: 0, y: 0 });
  const dragRef    = useRef({ active: false, sx: 0, sy: 0, px: 0, py: 0 });
  const rafRef     = useRef<number | null>(null);
  const firstMount = useRef(true); // controls initial fit-to-width

  // R4: restriction overlay state (kept in refs so drawOnCanvas stays a stable closure)
  const cutsRef        = useRef<DigestCut[]>([]);
  const selEnzymesRef  = useRef<string[]>([]);
  const onCutClickRef  = useRef<typeof onCutClick>(undefined);
  const cutHitsRef     = useRef<{ cut: DigestCut; sx: number; sy: number }[]>([]);
  const [hoveredCut, setHoveredCut] = useState<{ cut: DigestCut; sx: number; sy: number } | null>(null);

  useEffect(() => { seqRef.current = sequence; }, [sequence]);
  useEffect(() => { cutsRef.current = restrictionCuts || []; requestDraw(); }, [restrictionCuts]);
  useEffect(() => { selEnzymesRef.current = restrictionSelectedEnzymes || []; requestDraw(); }, [restrictionSelectedEnzymes]);
  useEffect(() => { onCutClickRef.current = onCutClick; }, [onCutClick]);

  /* ── Core draw function ─────────────────────────────────────────────────── */
  const drawOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr     = window.devicePixelRatio || 1;
    const logW    = canvas.width  / dpr;
    const logH    = canvas.height / dpr;
    const scale   = scaleRef.current;
    const panX    = panRef.current.x;
    const panY    = panRef.current.y;
    const seq     = seqRef.current;
    const totalBp = seq.length_bp || 1;
    const anns    = seq.annotations || [];
    const laneMap = assignLanes(anns);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ds       = getComputedStyle(document.documentElement);
    const cBorder  = ds.getPropertyValue('--color-border-subtle').trim()  || '#E5E7EB';
    const cPrimary = ds.getPropertyValue('--color-text-primary').trim()   || '#111827';
    const cSecond  = ds.getPropertyValue('--color-text-secondary').trim() || '#6B7280';

    // World ↔ screen helpers (logical CSS px, origin at canvas top-left)
    const bpToWX = (bp: number) => ((bp - 1) / totalBp) * WORLD_W;
    const wToSX  = (wx: number) => logW / 2 + panX + wx * scale;
    const wToSY  = (wy: number) => logH / 2 + panY + wy * scale;

    // Visible world-x range (with a small margin for partially visible items)
    const visMinX = (-logW / 2 - panX) / scale;
    const visMaxX = ( logW / 2 - panX) / scale;
    const MARGIN  = WORLD_W * 0.02;

    // Tick interval — pick smallest interval giving ≤ 8 ticks in visible range
    const visibleBp   = Math.max(1, ((visMaxX - visMinX) / WORLD_W) * totalBp);
    const tickInterval = TICK_INTERVALS.find((i) => visibleBp / i <= 8)
      ?? TICK_INTERVALS[TICK_INTERVALS.length - 1];
    const firstTick   = Math.ceil(1 / tickInterval) * tickInterval;
    const lastTick    = Math.floor(totalBp / tickInterval) * tickInterval;

    /* ── PHASE 1: world-space geometry ──────────────────────────────────────── */
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(logW / 2 + panX, logH / 2 + panY);
    ctx.scale(scale, scale);

    // Backbone
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WORLD_W, 0);
    ctx.strokeStyle = cBorder;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Feature rectangles and strand arrow indicators
    for (const ann of anns) {
      const lane = laneMap.get(ann.id) ?? 0;
      const wx1  = bpToWX(ann.start);
      const wx2  = bpToWX(ann.end);
      if (wx2 < visMinX - MARGIN || wx1 > visMaxX + MARGIN) continue;

      // wy_lower = world y closest to backbone (less negative); wy_upper = further from backbone
      const wy_lower = -(lane * (LANE_H + LANE_GAP) + LANE_GAP);
      const wy_upper = wy_lower - LANE_H;
      const rawW     = wx2 - wx1;
      const w        = Math.max(rawW, 2 / scale); // minimum 2 logical px wide

      const isPrimer = ann.type === 'primer_bind' || ann.type === 'primer';

      if (isPrimer) {
        // Dedicated 5'->3' half-arrow primer shape (height = 10 world px)
        const primerH = Math.min(LANE_H, 10);
        const wy_mid  = (wy_upper + wy_lower) / 2;
        const p_upper = wy_mid - primerH / 2;
        const p_lower = wy_mid + primerH / 2;

        // arrowW equals primerH so screen slope is an exact 45° angle (width == height)
        const arrowW = Math.min(primerH, w * 0.5);

        ctx.fillStyle = ann.color || '#8B5CF6';
        ctx.beginPath();

        if (ann.strand === '-' || (ann.strand as string) === '-1') {
          // Reverse primer: 5' flat edge at wx2; 45° slope up at 3' end to top corner (wx1, p_upper)
          ctx.moveTo(wx2, p_upper);
          ctx.lineTo(wx2, p_lower);
          ctx.lineTo(wx1 + arrowW, p_lower);
          ctx.lineTo(wx1, p_upper);
          ctx.closePath();
        } else {
          // Forward primer: 5' flat edge at wx1; 45° slope down at 3' end to bottom corner (wx2, p_lower)
          ctx.moveTo(wx1, p_lower);
          ctx.lineTo(wx1, p_upper);
          ctx.lineTo(wx2 - arrowW, p_upper);
          ctx.lineTo(wx2, p_lower);
          ctx.closePath();
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.lineWidth   = 1 / scale;
        ctx.stroke();
      } else {
        // Standard feature rectangle
        ctx.fillStyle = ann.color || '#3B82F6';
        ctx.fillRect(wx1, wy_upper, w, LANE_H);

        // Strand arrow indicator (dark overlay triangle appended at end edge)
        const featureScreenW = w * scale;
        if (featureScreenW > 6) {
          const arrowW = Math.min(LANE_H * 0.7, w * 0.35);
          ctx.fillStyle = 'rgba(0,0,0,0.20)';
          ctx.beginPath();
          if (ann.strand === '-' || (ann.strand as string) === '-1') {
            // Leftward triangle at start edge
            ctx.moveTo(wx1, wy_upper);
            ctx.lineTo(wx1 - arrowW, wy_upper + LANE_H / 2);
            ctx.lineTo(wx1, wy_lower);
          } else {
            // Rightward triangle at end edge
            ctx.moveTo(wx1 + w, wy_upper);
            ctx.lineTo(wx1 + w + arrowW, wy_upper + LANE_H / 2);
            ctx.lineTo(wx1 + w, wy_lower);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Ruler tick marks on backbone
    ctx.strokeStyle = cSecond;
    ctx.lineWidth   = 1;
    for (let bp = firstTick; bp <= lastTick; bp += tickInterval) {
      const wx = bpToWX(bp);
      if (wx < visMinX - MARGIN || wx > visMaxX + MARGIN) continue;
      ctx.beginPath();
      ctx.moveTo(wx, 0);
      ctx.lineTo(wx, RULER_OFFSET);
      ctx.stroke();
    }
    // Origin and end ticks
    ctx.beginPath(); ctx.moveTo(0,       0); ctx.lineTo(0,       TICK_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(WORLD_W, 0); ctx.lineTo(WORLD_W, TICK_H); ctx.stroke();

    ctx.restore(); // end PHASE 1

    /* ── PHASE 2: screen-space text ─────────────────────────────────────────── */
    ctx.save();
    ctx.scale(dpr, dpr); // DPR correction; no geometric transform

    // R4: restriction cut-site tick marks (drawn in screen space so stroke width
    // stays constant regardless of zoom level; labels below reuse the label-density gate)
    const overlayCuts = cutsRef.current;
    const overlaySelEnzymes = selEnzymesRef.current;
    const backboneSY = wToSY(0);
    const newCutHits: { cut: DigestCut; sx: number; sy: number }[] = [];
    for (const cut of overlayCuts) {
      const wx = bpToWX(cut.position);
      if (wx < visMinX - MARGIN || wx > visMaxX + MARGIN) continue;
      const sx = wToSX(wx);
      const isSelected = overlaySelEnzymes.length === 0 || overlaySelEnzymes.includes(cut.enzyme);
      const color = enzymeColor(cut.enzyme);
      ctx.beginPath();
      ctx.moveTo(sx, backboneSY - 10);
      ctx.lineTo(sx, backboneSY + 10);
      ctx.strokeStyle = color;
      ctx.globalAlpha = isSelected ? 1.0 : 0.3;
      ctx.lineWidth   = isSelected ? 2.5 : 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      newCutHits.push({ cut, sx, sy: backboneSY });
    }
    cutHitsRef.current = newCutHits;

    // ── Ruler bp labels ──
    ctx.font         = `${RULER_FONT_PX}px "Fira Code", "Courier New", monospace`;
    ctx.fillStyle    = cSecond;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    for (let bp = firstTick; bp <= lastTick; bp += tickInterval) {
      const wx = bpToWX(bp);
      if (wx < visMinX - MARGIN || wx > visMaxX + MARGIN) continue;
      const sx   = wToSX(wx);
      const sy   = wToSY(RULER_OFFSET) + 2;
      const text = bp >= 1_000_000
        ? `${(bp / 1_000_000).toFixed(bp % 1_000_000 === 0 ? 0 : 1)}M`
        : bp >= 1000
        ? `${(bp / 1000).toFixed(bp % 1000 === 0 ? 0 : 1)}k`
        : `${bp}`;
      ctx.fillText(text, sx, sy);
    }
    // '1' at left end and total bp at right end
    ctx.textAlign = 'left';
    ctx.fillText('1', wToSX(0) + 2, wToSY(RULER_OFFSET) + 2);
    ctx.textAlign = 'right';
    ctx.fillText(`${totalBp.toLocaleString()}`, wToSX(WORLD_W) - 2, wToSY(RULER_OFFSET) + 2);

    // ── Base-level sequence (shown when sufficiently zoomed in) ──
    const baseWidthPx = (WORLD_W / totalBp) * scale;
    if (baseWidthPx > BASE_SHOW_THR && seq.sequence) {
      const visBpMin = Math.max(0, Math.floor(visMinX / WORLD_W * totalBp) - 1);
      const visBpMax = Math.min(totalBp - 1, Math.ceil(visMaxX / WORLD_W * totalBp) + 1);
      ctx.font         = `${BASE_FONT_PX}px "Fira Code", "Courier New", monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const baseSY = wToSY(RULER_OFFSET / 2); // between backbone and ruler
      for (let i = visBpMin; i <= visBpMax; i++) {
        const base = seq.sequence[i] ?? '';
        // Centre each base within its world-coordinate slot
        const bsX  = wToSX(bpToWX(i + 1) + (WORLD_W / totalBp) / 2);
        // Colour by nucleotide (IUPAC convention)
        ctx.fillStyle =
          base === 'A' || base === 'a' ? '#16A34A' : // green
          base === 'T' || base === 't' ? '#DC2626' : // red
          base === 'G' || base === 'g' ? '#D97706' : // amber
          base === 'C' || base === 'c' ? '#2563EB' : // blue
          cSecond;
        ctx.fillText(base.toUpperCase(), bsX, baseSY);
      }
    }

    // ── Feature labels with type-priority ranking and density gate ──
    ctx.font         = `${LABEL_FONT_PX}px system-ui, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    type AABB = { l: number; r: number; t: number; b: number };
    const aabbHit = (a: AABB, b: AABB) =>
      a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const placed: AABB[] = [];

    const effectiveMinFeaturePx = scale >= 4.0 ? 4 : (scale >= 2.0 ? 10 : MIN_FEATURE_PX);

    const sortedAnns = [...anns].sort((a, b) => typePriority(a.type) - typePriority(b.type));

    for (const ann of sortedAnns) {
      const lane = laneMap.get(ann.id) ?? 0;
      const wx1  = bpToWX(ann.start);
      const wx2  = bpToWX(ann.end);
      if (wx2 < visMinX - MARGIN || wx1 > visMaxX + MARGIN) continue;

      const isPrimer = ann.type === 'primer_bind' || ann.type === 'primer';
      const isPoint  = ann.end <= ann.start || Math.abs(ann.end - ann.start) <= 1;
      const spanBp   = isPoint ? Math.max(12, totalBp / 200) : (ann.end - ann.start);
      const featureScreenPx = (spanBp / totalBp) * WORLD_W * scale;

      const minPx = isPrimer ? (scale >= 1.5 ? 4 : 10) : effectiveMinFeaturePx;
      if (featureScreenPx < minPx) continue;


      const midWX   = (wx1 + wx2) / 2;
      const wy_lower = -(lane * (LANE_H + LANE_GAP) + LANE_GAP);
      const wy_upper = wy_lower - LANE_H;

      const raw   = ann.name || ann.notes || ann.type || '';
      const label = raw.length > MAX_LABEL_CHARS
        ? raw.slice(0, MAX_LABEL_CHARS - 2) + '\u2026' : raw;
      const tw    = ctx.measureText(label).width;
      const hw    = tw / 2 + LABEL_PAD_X;
      const hh    = LABEL_FONT_PX / 2 + LABEL_PAD_Y;

      const baseSX = wToSX(midWX);
      const initialLSY = wToSY(wy_upper) - hh - 2;

      let lsy = initialLSY;
      let bumped = false;

      // Try up to 4 bump levels to clear colliding labels
      for (let bump = 0; bump < 4; bump++) {
        const testSY = initialLSY - bump * LABEL_BUMP_PX;
        const box: AABB = { l: baseSX - hw, r: baseSX + hw, t: testSY - hh, b: testSY + hh };
        if (!placed.some((p) => aabbHit(box, p))) {
          lsy = testSY;
          if (bump > 0) bumped = true;
          break;
        }
      }

      const finalBox: AABB = { l: baseSX - hw, r: baseSX + hw, t: lsy - hh, b: lsy + hh };
      if (placed.some((p) => aabbHit(finalBox, p))) {
        // If still colliding after 4 bumps, omit label to prevent clutter
        continue;
      }
      placed.push(finalBox);

      // Skip drawing if label is fully off-screen
      if (baseSX + hw < 0 || baseSX - hw > logW || lsy + hh < 0 || lsy - hh > logH) continue;

      // Vertical leader line and dot from feature top to bumped label
      if (bumped) {
        const featureTopSY = wToSY(wy_upper);
        ctx.beginPath();
        ctx.moveTo(baseSX, featureTopSY);
        ctx.lineTo(baseSX, lsy + hh + LEADER_GAP);
        ctx.strokeStyle = cSecond;
        ctx.lineWidth   = 1;
        ctx.lineCap     = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(baseSX, featureTopSY, LEADER_DOT_R, 0, 2 * Math.PI);
        ctx.fillStyle = ann.color || '#3B82F6';
        ctx.fill();
      }

      ctx.fillStyle = cPrimary;
      ctx.fillText(label, baseSX, lsy);
    }

    // R4: restriction cut-site labels below the backbone/ruler, density-gated via the
    // shared `placed` collision list; the tick mark above remains visible even when hidden
    const cutLabelBaseSY = backboneSY + 44;
    for (const cut of overlayCuts) {
      const wx = bpToWX(cut.position);
      if (wx < visMinX - MARGIN || wx > visMaxX + MARGIN) continue;
      const isSelected = overlaySelEnzymes.length === 0 || overlaySelEnzymes.includes(cut.enzyme);
      const color = enzymeColor(cut.enzyme);
      const sx = wToSX(wx);

      const raw   = `${cut.enzyme} @ ${cut.position} bp`;
      const label = raw.length > MAX_LABEL_CHARS ? raw.slice(0, MAX_LABEL_CHARS - 2) + '…' : raw;
      const tw = ctx.measureText(label).width;
      const hw = tw / 2 + LABEL_PAD_X;
      const hh = LABEL_FONT_PX / 2 + LABEL_PAD_Y;

      let lsy = -1;
      for (let bump = 0; bump < 4; bump++) {
        const testSY = cutLabelBaseSY + bump * LABEL_BUMP_PX;
        const box: AABB = { l: sx - hw, r: sx + hw, t: testSY - hh, b: testSY + hh };
        if (!placed.some((p) => aabbHit(box, p))) {
          lsy = testSY;
          placed.push(box);
          break;
        }
      }
      if (lsy === -1) continue;
      if (sx + hw < 0 || sx - hw > logW || lsy + hh < 0 || lsy - hh > logH) continue;

      ctx.globalAlpha = isSelected ? 1.0 : 0.4;
      ctx.fillStyle = color;
      ctx.fillText(label, sx, lsy);
      ctx.globalAlpha = 1.0;
    }

    ctx.restore(); // end PHASE 2
  }, []); // stable — reads all state via refs

  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawOnCanvas);
  }, [drawOnCanvas]);

  /* ── Helper: compute fit-to-width pan + scale from canvas dimensions ─────── */
  const setFitView = useCallback((logW: number, logH: number) => {
    const fit = (logW - 2 * SIDE_PAD) / WORLD_W;
    scaleRef.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fit));
    // panX: sequence starts SIDE_PAD px from left edge
    // panY: push backbone to 65% down to leave space for features above
    panRef.current = {
      x: SIDE_PAD - logW / 2,
      y: logH * 0.15,
    };
  }, []);

  /* ── Resize observer ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width  = Math.round(width  * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width  = `${width}px`;
        canvas.style.height = `${height}px`;
        // Set initial scale/pan only on first observation
        if (firstMount.current && width > 0) {
          firstMount.current = false;
          setFitView(width, height);
        }
        requestDraw();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [requestDraw, setFitView]);

  useEffect(() => { requestDraw(); }, [sequence, requestDraw]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Wheel zoom & pan (non-passive) ───────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + wheel = horizontal pan
        panRef.current.x -= e.deltaY;
        requestDraw();
        return;
      }
      const dpr  = window.devicePixelRatio || 1;
      const logW = canvas.width  / dpr;
      const rect = canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const prev = scaleRef.current;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        prev * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
      const wx = (mx - logW / 2 - panRef.current.x) / prev;
      panRef.current.x = mx - logW / 2 - wx * next;
      // panRef.current.y is kept constant — no vertical shift on zoom
      scaleRef.current = next;
      requestDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [requestDraw]);

  /* ── Click-drag pan ─────────────────────────────────────────────────────── */
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      px: panRef.current.x,
      py: panRef.current.y,
    };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, []);

  // R4: find the nearest restriction cut-site marker to a canvas-local point
  const hitTestCut = useCallback((localX: number, localY: number) => {
    return cutHitsRef.current.find(
      (h) => Math.hypot(h.sx - localX, h.sy - localY) <= CUT_HIT_RADIUS
    ) || null;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current.active) {
      setHoveredCut(null);
      panRef.current = {
        x: dragRef.current.px + (e.clientX - dragRef.current.sx),
        y: dragRef.current.py, // strictly zero out vertical drag component
      };
      requestDraw();
      return;
    }

    // R4: hover hit-test for cut-site tooltip (only when not dragging)
    const rect = canvas.getBoundingClientRect();
    const hit = hitTestCut(e.clientX - rect.left, e.clientY - rect.top);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    setHoveredCut(hit ? { cut: hit.cut, sx: e.clientX, sy: e.clientY } : null);
  }, [requestDraw, hitTestCut]);

  const endDrag = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasActive = dragRef.current.active;
    const moved = Math.hypot(e.clientX - dragRef.current.sx, e.clientY - dragRef.current.sy);
    dragRef.current.active = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';

    // R4: treat a near-stationary mouseup as a click — jump to the cut site if one was hit
    if (wasActive && moved < 5 && canvasRef.current && onCutClickRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const hit = hitTestCut(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onCutClickRef.current(hit.cut);
    }
  }, [hitTestCut]);

  const onMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    setHoveredCut(null);
  }, []);

  /* ── Zoom button handlers ─────────────────────────────────────────────── */
  const doZoomIn = useCallback(() => {
    scaleRef.current = Math.min(MAX_SCALE, scaleRef.current * ZOOM_STEP);
    requestDraw();
  }, [requestDraw]);

  const doZoomOut = useCallback(() => {
    scaleRef.current = Math.max(MIN_SCALE, scaleRef.current / ZOOM_STEP);
    requestDraw();
  }, [requestDraw]);

  // Reset = fit sequence back to canvas width
  const doReset = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr  = window.devicePixelRatio || 1;
      const logW = canvas.width  / dpr;
      const logH = canvas.height / dpr;
      setFitView(logW, logH);
    } else {
      scaleRef.current = 1.0;
      panRef.current   = { x: 0, y: 0 };
    }
    requestDraw();
  }, [requestDraw, setFitView]);

  return (
    <div ref={wrapRef} className="viewer-canvas-wrap" data-testid="linear-viewer">
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={onMouseLeave}
      />
      <div className="viewer-controls" aria-label="Viewer controls">
        <button
          id="linear-zoom-in"
          className="viewer-controls__btn"
          onClick={doZoomIn}
          title="Zoom in"
        >+</button>
        <button
          id="linear-zoom-out"
          className="viewer-controls__btn"
          onClick={doZoomOut}
          title="Zoom out"
        >&#x2212;</button>
        <button
          id="linear-reset"
          className="viewer-controls__btn"
          onClick={doReset}
          title="Fit sequence to width"
        >&#x2194;</button>
      </div>
      {hoveredCut && (
        <div
          className="restriction-cut-tooltip"
          style={{
            position: 'fixed',
            left: hoveredCut.sx + 12,
            top: hoveredCut.sy + 12,
            zIndex: 1000,
            pointerEvents: 'none',
            background: 'var(--color-bg-secondary, #1E293B)',
            color: 'var(--color-text-primary, #F9FAFB)',
            border: '1px solid var(--color-border-subtle, #334155)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
          }}
        >
          <strong>{hoveredCut.cut.enzyme}</strong> @ {hoveredCut.cut.position} bp ({hoveredCut.cut.site})
        </div>
      )}
    </div>
  );
}
