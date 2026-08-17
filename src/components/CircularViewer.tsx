// components/CircularViewer.tsx
// Canvas-based circular plasmid viewer — rebuilt per Step 0 of the remediation plan.
// v2: centre-fixed zoom, density-gated labels with type-priority ranking.
import { useRef, useEffect, useCallback, useState } from 'react';
import { SequenceState, DigestCut } from '../src/contracts';

interface Props {
  sequence: SequenceState;
  restrictionCuts?: DigestCut[];
  restrictionSelectedEnzymes?: string[];
  onCutClick?: (cut: DigestCut) => void;
  // R5: Two-way gel <-> map linkage
  selectedFragmentSpan?: { start: number; end: number } | null;
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

/* ── Geometry constants (world-space px at scale = 1) ─────────────────────── */
const BASE_RADIUS_RATIO = 0.30;  // backbone radius / min(logW, logH)
const ARC_THICKNESS     = 10;   // feature arc stroke width (world px)
const RING_0_OFFSET     = 18;   // ring-0 label centre from arc outer edge (world px)
const RING_GAP          = 18;   // radial gap between ring centres (world px)
const MAX_RINGS         = 3;

/* ── Label density gate (screen-space) ───────────────────────────────────── */
// A label is only drawn when the feature arc ≥ this many screen pixels wide.
// Tune upward to be more aggressive about hiding crowded labels.
const MIN_ARC_PX = 22;  // screen px of arc subtended before label appears

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

/* ── Label screen constants ──────────────────────────────────────────────── */
const LABEL_FONT_PX   = 11;
const LABEL_PAD_X     = 3;
const LABEL_PAD_Y     = 2;
const LEADER_DOT_R    = 2.5;
const LEADER_GAP      = 5;
const MAX_LABEL_CHARS = 22;

/* ── Viewport ────────────────────────────────────────────────────────────── */
const MIN_SCALE = 0.25;
const MAX_SCALE = 25.0;
const ZOOM_STEP = 1.20;

export default function CircularViewer({
  sequence,
  restrictionCuts,
  restrictionSelectedEnzymes,
  onCutClick,
  selectedFragmentSpan,
}: Props) {
  const wrapRef     = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const seqRef      = useRef(sequence);
  const scaleRef    = useRef(1.0);
  const centerBpRef = useRef(1);
  const dragRef     = useRef({ active: false, startX: 0, startY: 0, startBp: 1 });
  const rafRef      = useRef<number | null>(null);

  // R4: restriction overlay state (kept in refs so drawOnCanvas stays a stable closure)
  const cutsRef        = useRef<DigestCut[]>([]);
  const selEnzymesRef  = useRef<string[]>([]);
  const onCutClickRef  = useRef<typeof onCutClick>(undefined);
  const cutHitsRef     = useRef<{ cut: DigestCut; sx: number; sy: number }[]>([]);
  const [hoveredCut, setHoveredCut] = useState<{ cut: DigestCut; sx: number; sy: number } | null>(null);

  // R5: highlighted fragment span overlay state
  const selectedSpanRef = useRef<typeof selectedFragmentSpan>(undefined);

  useEffect(() => { seqRef.current = sequence; }, [sequence]);
  useEffect(() => { cutsRef.current = restrictionCuts || []; requestDraw(); }, [restrictionCuts]);
  useEffect(() => { selEnzymesRef.current = restrictionSelectedEnzymes || []; requestDraw(); }, [restrictionSelectedEnzymes]);
  useEffect(() => { onCutClickRef.current = onCutClick; }, [onCutClick]);
  useEffect(() => { selectedSpanRef.current = selectedFragmentSpan; requestDraw(); }, [selectedFragmentSpan]);

  /* ── Core draw ────────────────────────────────────────────────────────── */
  const drawOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr      = window.devicePixelRatio || 1;
    const logW     = canvas.width  / dpr;
    const logH     = canvas.height / dpr;
    const scale    = scaleRef.current;
    const centerBp = centerBpRef.current;
    const seq      = seqRef.current;
    const totalBp  = seq.length_bp || 1;
    const anns     = seq.annotations || [];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ds       = getComputedStyle(document.documentElement);
    const cBorder  = ds.getPropertyValue('--color-border-subtle').trim()  || '#E5E7EB';
    const cPrimary = ds.getPropertyValue('--color-text-primary').trim()   || '#111827';
    const cSecond  = ds.getPropertyValue('--color-text-secondary').trim() || '#6B7280';

    const R0        = Math.min(logW, logH) * BASE_RADIUS_RATIO;
    const R         = R0 * scale;
    const cx        = logW / 2;
    const cy        = logH / 2 + R0 * (scale - 1); // Anchor top of ring at logH/2 - R0

    // Map base pair to angle, centering active base pair (centerBp) at top of canvas (-pi/2)
    const bpToAngle = (bp: number) => {
      let delta = (bp - centerBp) % totalBp;
      if (delta < 0) delta += totalBp;
      return (delta / totalBp) * 2 * Math.PI - Math.PI / 2;
    };

    // World-to-screen: world origin relative to circle center (cx, cy)
    const w2sx = (wx: number) => cx + wx;
    const w2sy = (wy: number) => cy + wy;

    /* ── PHASE 1: SnapGene-style gradual sector/cone geometry ─────────────── */
    ctx.save();
    ctx.scale(dpr, dpr);

    // Backbone circle (radius R, center cx, cy)
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = cBorder;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Adaptive base-pair tick marks along backbone
    const targetTicks = 12 * Math.min(6, Math.max(1, Math.sqrt(scale)));
    const rawInterval = totalBp / targetTicks;
    const pow10       = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawInterval))));
    let tickInterval  = pow10;
    if (rawInterval / pow10 >= 5) tickInterval = pow10 * 5;
    else if (rawInterval / pow10 >= 2) tickInterval = pow10 * 2;
    tickInterval = Math.max(1, Math.round(tickInterval));

    ctx.save();
    ctx.strokeStyle = cSecond;
    ctx.lineWidth   = 1;
    ctx.font        = '10px "Fira Code", "Courier New", monospace';
    ctx.fillStyle   = cSecond;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    for (let bp = 1; bp <= totalBp; bp += tickInterval) {
      const angle  = bpToAngle(bp);
      const cosA   = Math.cos(angle);
      const sinA   = Math.sin(angle);
      const innerR = R - 5;
      const outerR = R + 5;
      const sx1    = cx + cosA * innerR;
      const sy1    = cy + sinA * innerR;
      const sx2    = cx + cosA * outerR;
      const sy2    = cy + sinA * outerR;

      if (sx2 >= -20 && sx2 <= logW + 20 && sy2 >= -20 && sy2 <= logH + 20) {
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();

        // Display base pair coordinate on major ticks when zoomed in
        if (scale >= 1.5 && (bp - 1) % (tickInterval * 2) === 0) {
          const lblR = R - 15;
          const lx   = cx + cosA * lblR;
          const ly   = cy + sinA * lblR;
          if (lx >= 15 && lx <= logW - 15 && ly >= 15 && ly <= logH - 15) {
            ctx.fillText(`${bp}`, lx, ly);
          }
        }
      }
    }
    ctx.restore();

    // Centre plasmid title text (only shown at full/low zoom scale <= 1.3 to avoid collisions)
    let titleBox: { l: number; r: number; t: number; b: number } | null = null;
    if (scale <= 1.3) {
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const displayName = seq.name.length > 20
        ? seq.name.slice(0, 18) + '\u2026' : seq.name;
      const textY = cy;
      if (textY >= 20 && textY <= logH - 20) {
        ctx.font      = '600 13px system-ui, sans-serif';
        ctx.fillStyle = cPrimary;
        ctx.fillText(displayName, cx, textY - 10);
        ctx.font      = '11px "Fira Code", "Courier New", monospace';
        ctx.fillStyle = cSecond;
        ctx.fillText(`${seq.length_bp.toLocaleString()} bp`, cx, textY + 8);

        const titleWidth = Math.max(100, ctx.measureText(displayName).width + 20);
        titleBox = { l: cx - titleWidth / 2, r: cx + titleWidth / 2, t: textY - 25, b: textY + 20 };
      }
      ctx.restore();
    }

    // Feature arcs, primers, and restriction cut sites
    for (const ann of anns) {
      const isPoint = ann.end <= ann.start || Math.abs(ann.end - ann.start) <= 1;
      const isPrimer = ann.type === 'primer_bind' || ann.type === 'primer';
      const isCutSite = ann.type === 'restriction_site' || ann.type === 'site';

      if (isCutSite || (isPoint && !isPrimer)) {
        // Draw radial cut tick mark across backbone for restriction site
        const angle = bpToAngle(ann.start);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx + cosA * (R - 7), cy + sinA * (R - 7));
        ctx.lineTo(cx + cosA * (R + 7), cy + sinA * (R + 7));
        ctx.strokeStyle = ann.color || '#EF4444';
        ctx.lineWidth   = 2;
        ctx.stroke();
      } else if (isPrimer) {
        // Draw directional primer arrow
        const endBp   = ann.end < ann.start ? ann.end + totalBp : ann.end;
        const sa      = bpToAngle(ann.start);
        const ea      = bpToAngle(endBp);
        const primerR = ann.strand === '-' ? R - 8 : R + 8;
        ctx.beginPath();
        ctx.arc(cx, cy, primerR, sa, ea);
        ctx.strokeStyle = ann.color || '#8B5CF6';
        ctx.lineWidth   = 4;
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Draw arrowhead at 3' end
        const arrowAngle = ann.strand === '-' ? sa : ea;
        const arrowCos   = Math.cos(arrowAngle);
        const arrowSin   = Math.sin(arrowAngle);
        const dir        = ann.strand === '-' ? -1 : 1;
        const tangentX   = -arrowSin * dir;
        const tangentY   = arrowCos * dir;
        const tipX       = cx + arrowCos * primerR;
        const tipY       = cy + arrowSin * primerR;

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - tangentX * 6 + arrowCos * 4, tipY - tangentY * 6 + arrowSin * 4);
        ctx.lineTo(tipX - tangentX * 6 - arrowCos * 4, tipY - tangentY * 6 - arrowSin * 4);
        ctx.fillStyle = ann.color || '#8B5CF6';
        ctx.fill();
      } else {
        // Standard feature arc
        const endBp = ann.end < ann.start ? ann.end + totalBp : ann.end;
        const sa    = bpToAngle(ann.start);
        const ea    = bpToAngle(endBp);
        ctx.beginPath();
        ctx.arc(cx, cy, R, sa, ea);
        ctx.strokeStyle = ann.color || '#3B82F6';
        ctx.lineWidth   = ARC_THICKNESS;
        ctx.lineCap     = 'round';
        ctx.stroke();
      }
    }

    // R4: restriction cut-site tick marks (labels drawn in PHASE 2)
    const overlayCuts = cutsRef.current;
    const overlaySelEnzymes = selEnzymesRef.current;
    const newCutHits: { cut: DigestCut; sx: number; sy: number }[] = [];
    for (const cut of overlayCuts) {
      const angle = bpToAngle(cut.position);
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);
      const isSelected = overlaySelEnzymes.length === 0 || overlaySelEnzymes.includes(cut.enzyme);
      const color = enzymeColor(cut.enzyme);
      const innerR = R - 9;
      const outerR = R + 9;
      ctx.beginPath();
      ctx.moveTo(cx + cosA * innerR, cy + sinA * innerR);
      ctx.lineTo(cx + cosA * outerR, cy + sinA * outerR);
      ctx.strokeStyle = color;
      ctx.globalAlpha = isSelected ? 1.0 : 0.3;
      ctx.lineWidth   = isSelected ? 3 : 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      const midR = (innerR + outerR) / 2;
      newCutHits.push({ cut, sx: cx + cosA * midR, sy: cy + sinA * midR });
    }
    cutHitsRef.current = newCutHits;

    // R5: highlighted fragment span overlay on the circular backbone
    const selectedSpan = selectedSpanRef.current;
    if (selectedSpan && totalBp > 0 && overlaySelEnzymes.length > 0) {
      const { start, end } = selectedSpan;
      let sa: number;
      let ea: number;

      if (start === end) {
        // Single-cut / full circle
        sa = bpToAngle(start);
        ea = sa + 2 * Math.PI;
      } else if (start < end) {
        sa = bpToAngle(start);
        ea = bpToAngle(end);
      } else {
        // Wrapping fragment across the origin
        sa = bpToAngle(start);
        ea = bpToAngle(end + totalBp);
      }

      ctx.save();
      // Outer translucent glow / arc
      ctx.beginPath();
      ctx.arc(cx, cy, R, sa, ea);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
      ctx.lineWidth   = ARC_THICKNESS + 6;
      ctx.lineCap     = 'butt';
      ctx.stroke();

      // Sharp accent border arcs
      ctx.beginPath();
      ctx.arc(cx, cy, R + (ARC_THICKNESS + 6) / 2, sa, ea);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, R - (ARC_THICKNESS + 6) / 2, sa, ea);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Boundary tick marks at start & end
      if (start !== end) {
        const drawBoundaryTick = (bp: number) => {
          const a = bpToAngle(bp);
          const cosA = Math.cos(a);
          const sinA = Math.sin(a);
          const r1 = R - (ARC_THICKNESS + 10) / 2;
          const r2 = R + (ARC_THICKNESS + 10) / 2;
          ctx.beginPath();
          ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
          ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth   = 2;
          ctx.stroke();
        };
        drawBoundaryTick(start);
        drawBoundaryTick(end);
      }
      ctx.restore();
    }

    ctx.restore(); // end PHASE 1

    /* ── PHASE 2: screen-space labels (Option C: Dedicated Primer Track + Unlimited Outer Stacking) ── */
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.font         = `${LABEL_FONT_PX}px system-ui, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    type AABB = { l: number; r: number; t: number; b: number };
    const aabbHit = (a: AABB, b: AABB) =>
      a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const placed: AABB[] = [];
    if (titleBox) placed.push(titleBox);

    // Adaptive density gate threshold (lowered when zoomed in to unlock all primers)
    const effectiveMinArcPx = scale >= 4.0 ? 4 : (scale >= 2.0 ? 10 : MIN_ARC_PX);

    // Separate primers onto a dedicated primer track; features use outer rings without cap when zoomed
    const primersList = anns.filter(a => a.type === 'primer_bind' || a.type === 'primer');
    const featureList = anns.filter(a => a.type !== 'primer_bind' && a.type !== 'primer')
      .sort((a, b) => typePriority(a.type) - typePriority(b.type));

    // 1. Draw Primers on Dedicated Primer Track (adjacent to primer arrows)
    for (const ann of primersList) {
      const isPoint  = ann.end <= ann.start || Math.abs(ann.end - ann.start) <= 1;
      const endBp    = ann.end < ann.start ? ann.end + totalBp : ann.end;
      const spanBp   = isPoint ? Math.max(12, totalBp / 200) : (endBp - ann.start);
      const arcAngle = (spanBp / totalBp) * 2 * Math.PI;

      const arcScreenPx = arcAngle * R;
      if (arcScreenPx < effectiveMinArcPx) continue;

      const midAngle = bpToAngle((ann.start + endBp) / 2);
      const cosA     = Math.cos(midAngle);
      const sinA     = Math.sin(midAngle);

      const approxSY = cy + sinA * (R + RING_0_OFFSET);
      if (approxSY < -50 || approxSY > logH + 50) continue;

      const raw   = ann.name || ann.notes || ann.type || '';
      const label = raw.length > MAX_LABEL_CHARS
        ? raw.slice(0, MAX_LABEL_CHARS - 2) + '\u2026' : raw;
      const tw = ctx.measureText(label).width;
      const hw = tw / 2 + LABEL_PAD_X;
      const hh = LABEL_FONT_PX / 2 + LABEL_PAD_Y;

      // Base radius for primer label: outside backbone for +, inside for -
      const basePrimerR = ann.strand === '-' ? R - 22 : R + 22;

      // Try up to 4 sub-track offsets if multiple primers overlap in same region
      let chosenR = -1;
      for (let sub = 0; sub < 4; sub++) {
        const rW = ann.strand === '-' ? basePrimerR - sub * 16 : basePrimerR + sub * 16;
        const sx = w2sx(cosA * rW);
        const sy = w2sy(sinA * rW);
        const box: AABB = { l: sx - hw, r: sx + hw, t: sy - hh, b: sy + hh };
        if (!placed.some((p) => aabbHit(box, p))) {
          chosenR = rW;
          placed.push(box);
          break;
        }
      }
      if (chosenR === -1) continue;

      const lsx = w2sx(cosA * chosenR);
      const lsy = w2sy(sinA * chosenR);

      ctx.fillStyle = ann.color || '#8B5CF6';
      ctx.fillText(label, lsx, lsy);
    }

    // 2. Draw General Feature Annotations on Outer Feature Rings (dynamic unlimited stacking when zoomed)
    const maxRings = scale >= 1.5 ? 16 : MAX_RINGS;

    for (const ann of featureList) {
      const isPoint  = ann.end <= ann.start || Math.abs(ann.end - ann.start) <= 1;
      const endBp    = ann.end < ann.start ? ann.end + totalBp : ann.end;
      const spanBp   = isPoint ? Math.max(12, totalBp / 200) : (endBp - ann.start);
      const arcAngle = (spanBp / totalBp) * 2 * Math.PI;

      const arcScreenPx = arcAngle * R;
      if (arcScreenPx < effectiveMinArcPx) continue;

      const midAngle = bpToAngle((ann.start + endBp) / 2);
      const cosA     = Math.cos(midAngle);
      const sinA     = Math.sin(midAngle);

      const approxSY = cy + sinA * (R + RING_0_OFFSET);
      if (approxSY < -50 || approxSY > logH + 50) continue;

      const raw   = ann.name || ann.notes || ann.type || '';
      const label = raw.length > MAX_LABEL_CHARS
        ? raw.slice(0, MAX_LABEL_CHARS - 2) + '\u2026' : raw;
      const tw = ctx.measureText(label).width;
      const hw = tw / 2 + LABEL_PAD_X;
      const hh = LABEL_FONT_PX / 2 + LABEL_PAD_Y;

      const aeWorld = R + ARC_THICKNESS / 2 + 3;
      const aeSX    = w2sx(cosA * aeWorld);
      const aeSY    = w2sy(sinA * aeWorld);

      let chosenRing = -1;
      for (let ring = 0; ring < maxRings; ring++) {
        const rW  = R + ARC_THICKNESS / 2 + RING_0_OFFSET + ring * RING_GAP;
        const sx  = w2sx(cosA * rW);
        const sy  = w2sy(sinA * rW);
        const box: AABB = { l: sx - hw, r: sx + hw, t: sy - hh, b: sy + hh };
        if (!placed.some((p) => aabbHit(box, p))) {
          chosenRing = ring;
          break;
        }
      }
      if (chosenRing === -1) continue;

      const finalRW = R + ARC_THICKNESS / 2 + RING_0_OFFSET + chosenRing * RING_GAP;
      const lsx     = w2sx(cosA * finalRW);
      const lsy     = w2sy(sinA * finalRW);
      placed.push({ l: lsx - hw, r: lsx + hw, t: lsy - hh, b: lsy + hh });

      if (chosenRing > 0) {
        const dx   = lsx - aeSX;
        const dy   = lsy - aeSY;
        const dist = Math.hypot(dx, dy) || 1;
        const ux   = dx / dist;
        const uy   = dy / dist;
        const tX   = ux !== 0 ? hw / Math.abs(ux) : Infinity;
        const tY   = uy !== 0 ? hh / Math.abs(uy) : Infinity;
        const t    = Math.min(tX, tY) + LEADER_GAP;

        ctx.beginPath();
        ctx.moveTo(aeSX, aeSY);
        ctx.lineTo(lsx - ux * t, lsy - uy * t);
        ctx.strokeStyle = cSecond;
        ctx.lineWidth   = 1;
        ctx.lineCap     = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(aeSX, aeSY, LEADER_DOT_R, 0, 2 * Math.PI);
        ctx.fillStyle = ann.color || '#3B82F6';
        ctx.fill();
      }

      ctx.fillStyle = cPrimary;
      ctx.fillText(label, lsx, lsy);
    }

    // 3. R4: restriction cut-site labels (density-gated via shared `placed` collision list;
    // the tick mark from PHASE 1 remains visible even when the label is skipped)
    const baseCutR = R - 22;
    for (const cut of overlayCuts) {
      const angle = bpToAngle(cut.position);
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);
      const isSelected = overlaySelEnzymes.length === 0 || overlaySelEnzymes.includes(cut.enzyme);
      const color = enzymeColor(cut.enzyme);

      const raw   = `${cut.enzyme} @ ${cut.position} bp`;
      const label = raw.length > MAX_LABEL_CHARS ? raw.slice(0, MAX_LABEL_CHARS - 2) + '…' : raw;
      const tw = ctx.measureText(label).width;
      const hw = tw / 2 + LABEL_PAD_X;
      const hh = LABEL_FONT_PX / 2 + LABEL_PAD_Y;

      let chosenR = -1;
      for (let sub = 0; sub < 4; sub++) {
        const rW = baseCutR - sub * 16;
        const sx = w2sx(cosA * rW);
        const sy = w2sy(sinA * rW);
        const box: AABB = { l: sx - hw, r: sx + hw, t: sy - hh, b: sy + hh };
        if (!placed.some((p) => aabbHit(box, p))) {
          chosenR = rW;
          placed.push(box);
          break;
        }
      }
      if (chosenR === -1) continue;

      const lsx = w2sx(cosA * chosenR);
      const lsy = w2sy(sinA * chosenR);
      ctx.globalAlpha = isSelected ? 1.0 : 0.4;
      ctx.fillStyle = color;
      ctx.fillText(label, lsx, lsy);
      ctx.globalAlpha = 1.0;
    }

    ctx.restore(); // end PHASE 2
  }, []); // stable — reads all state via refs

  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawOnCanvas);
  }, [drawOnCanvas]);

  /* ── Resize observer ─────────────────────────────────────────────────── */
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
        requestDraw();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [requestDraw]);

  useEffect(() => { requestDraw(); }, [sequence, requestDraw]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Wheel zoom ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scaleRef.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        scaleRef.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
      requestDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [requestDraw]);

  /* ── Drag to rotate plasmid sequence (SnapGene navigation) ─────────────── */
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startBp: centerBpRef.current,
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
      const rect   = canvas.getBoundingClientRect();
      const width  = rect.width || 1;
      const dx     = e.clientX - dragRef.current.startX;
      const seq    = seqRef.current;
      const totalBp = seq.length_bp || 1;
      const scale  = scaleRef.current;

      const bpSpan  = totalBp / scale;
      const deltaBp = -(dx / width) * bpSpan;
      let newCenterBp = (dragRef.current.startBp + deltaBp) % totalBp;
      if (newCenterBp <= 0) newCenterBp += totalBp;

      centerBpRef.current = Math.round(newCenterBp);
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
    const moved = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY);
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

  const doReset = useCallback(() => {
    scaleRef.current    = 1.0;
    centerBpRef.current = 1;
    requestDraw();
  }, [requestDraw]);

  return (
    <div ref={wrapRef} className="viewer-canvas-wrap" data-testid="circular-viewer">
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={onMouseLeave}
      />
      <div className="viewer-controls" aria-label="Viewer controls">
        <button id="circular-zoom-in"  className="viewer-controls__btn" onClick={doZoomIn}  title="Zoom in">+</button>
        <button id="circular-zoom-out" className="viewer-controls__btn" onClick={doZoomOut} title="Zoom out">&#x2212;</button>
        <button id="circular-reset"    className="viewer-controls__btn" onClick={doReset}   title="Reset view">&#x2299;</button>
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
