import { useState } from 'react';
import { DigestCut } from '../src/contracts';
import { computeFragmentSpans, FragmentSpan, isSpanSelected } from '../utils/restrictionUtils';

interface Props {
  sequenceName: string;
  totalBp: number;
  topology?: string;
  cuts: DigestCut[];
  selectedEnzymes: string[];
  selectedFragmentSpan?: { start: number; end: number } | null;
  onFragmentClick?: (span: { start: number; end: number; length: number; enzyme: string } | null) => void;
}

// Standard 1kb DNA Ladder bands (bp)
const LADDER_BANDS = [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500];

export default function VirtualGel({
  sequenceName,
  totalBp,
  topology = 'circular',
  cuts,
  selectedEnzymes,
  selectedFragmentSpan,
  onFragmentClick,
}: Props) {
  const maxBp = 10000;
  const minBp = 100;
  const gelWidth = 320;
  const gelHeight = 360;
  const laneYTop = 50;
  const laneYBottom = 330;

  const [hoveredSpan, setHoveredSpan] = useState<{
    span: FragmentSpan;
    sx: number;
    sy: number;
  } | null>(null);

  // Logarithmic migration distance formula for agarose gel electrophoresis
  const bpToY = (bp: number) => {
    const clamped = Math.max(minBp, Math.min(maxBp, bp));
    const logMin = Math.log10(minBp);
    const logMax = Math.log10(maxBp);
    const fraction = (Math.log10(clamped) - logMin) / (logMax - logMin);
    // Invert because smaller fragments migrate further down
    return laneYBottom - fraction * (laneYBottom - laneYTop);
  };

  // Calculate derived fragment spans from cuts
  const fragmentSpans: FragmentSpan[] = (cuts.length === 0 && selectedEnzymes.length > 0)
    ? computeFragmentSpans([], totalBp, topology)
    : (cuts.length > 0 ? computeFragmentSpans(cuts, totalBp, topology) : []);

  return (
    <div
      className="virtual-gel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Virtual Agarose Gel Simulator (1% Agarose)
        </h4>
        {sequenceName && (
          <div
            title={sequenceName}
            style={{
              margin: '2px 0 0 0',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-primary, #F1F5F9)',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sequenceName}
          </div>
        )}
      </div>
      <svg
        width={gelWidth}
        height={gelHeight}
        viewBox={`0 0 ${gelWidth} ${gelHeight}`}
        style={{
          width: '100%',
          maxWidth: `${gelWidth}px`,
          height: 'auto',
          background: '#0B0F19', // Dark UV gel box background
          borderRadius: '8px',
          border: '2px solid var(--color-border-subtle, #1E293B)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Gel Wells */}
        <rect x="30" y="20" width="80" height="8" rx="2" fill="#1E293B" />
        <text x="70" y="16" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">
          Ladder
        </text>

        <rect x="150" y="20" width="90" height="8" rx="2" fill="#1E293B" />
        <text x="195" y="16" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">
          Digest Sample
        </text>

        {/* Lane 1: 1kb Ladder Bands (Non-interactive) */}
        {LADDER_BANDS.map((bp) => {
          const y = bpToY(bp);
          return (
            <g key={`ladder-${bp}`} pointerEvents="none">
              {/* Fluorescent EtBr/GelRed DNA Band */}
              <line
                x1="35"
                y1={y}
                x2="105"
                y2={y}
                stroke="#60A5FA" // Cyan UV glow
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.85"
                style={{ filter: 'drop-shadow(0 0 3px #3B82F6)' }}
              />
              <text x="26" y={y + 3} textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">
                {bp >= 1000 ? `${bp / 1000}k` : `${bp}`}
              </text>
            </g>
          );
        })}

        {/* Lane 2: Digest Sample Bands (Interactive: hover & click) */}
        {fragmentSpans.map((span, idx) => {
          const y = bpToY(span.length);
          const isSelected = isSpanSelected(span, selectedFragmentSpan);
          const isHovered = hoveredSpan?.span.index === span.index;

          return (
            <g
              key={`frag-${idx}-${span.start}-${span.end}-${span.length}`}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (isSelected) {
                  onFragmentClick?.(null);
                } else {
                  onFragmentClick?.({
                    start: span.start,
                    end: span.end,
                    length: span.length,
                    enzyme: span.enzyme,
                  });
                }
              }}
              onMouseEnter={(e) => setHoveredSpan({ span, sx: e.clientX, sy: e.clientY })}
              onMouseMove={(e) => setHoveredSpan({ span, sx: e.clientX, sy: e.clientY })}
              onMouseLeave={() => setHoveredSpan(null)}
            >
              {/* Invisible wider hit area for easy clicking */}
              <line
                x1="150"
                y1={y}
                x2="245"
                y2={y}
                stroke="transparent"
                strokeWidth="14"
              />
              {/* Visible fluorescent band with selection emphasis */}
              <line
                x1="155"
                y1={y}
                x2="240"
                y2={y}
                stroke={isSelected ? '#FFFFFF' : (isHovered ? '#7DD3FC' : '#38BDF8')}
                strokeWidth={isSelected ? '6' : (isHovered ? '5' : '4')}
                strokeLinecap="round"
                style={{
                  filter: isSelected
                    ? 'drop-shadow(0 0 8px #38BDF8) drop-shadow(0 0 2px #FFFFFF)'
                    : (isHovered ? 'drop-shadow(0 0 6px #0EA5E9)' : 'drop-shadow(0 0 4px #0EA5E9)'),
                  transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
                }}
              />
              <text
                x="246"
                y={y + 3}
                textAnchor="start"
                fill={isSelected ? '#38BDF8' : '#F1F5F9'}
                fontSize="10"
                fontFamily="monospace"
                fontWeight={isSelected ? '700' : '600'}
              >
                {span.length.toLocaleString()} bp
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip for fragment details */}
      {hoveredSpan && (
        <div
          className="virtual-gel-tooltip"
          style={{
            position: 'fixed',
            left: hoveredSpan.sx + 12,
            top: hoveredSpan.sy + 12,
            zIndex: 1000,
            pointerEvents: 'none',
            background: 'var(--color-bg-secondary, #1E293B)',
            color: 'var(--color-text-primary, #F9FAFB)',
            border: '1px solid var(--color-border-subtle, #334155)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <strong>{hoveredSpan.span.enzyme !== 'Uncut' ? `${hoveredSpan.span.enzyme} fragment` : 'Uncut DNA'}</strong>:{' '}
          {hoveredSpan.span.length.toLocaleString()} bp
          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary, #94A3B8)' }}>
            {hoveredSpan.span.enzyme === 'Uncut'
              ? `Full sequence (1–${totalBp} bp)`
              : hoveredSpan.span.isWrapped && hoveredSpan.span.start === hoveredSpan.span.end
              ? `Full circular plasmid (${hoveredSpan.span.start} bp cut)`
              : hoveredSpan.span.isWrapped
              ? `Positions ${hoveredSpan.span.start}–${totalBp} & 1–${hoveredSpan.span.end}`
              : `Positions ${hoveredSpan.span.start}–${hoveredSpan.span.end}`}
          </div>
        </div>
      )}
    </div>
  );
}
