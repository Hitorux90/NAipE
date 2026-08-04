import { DigestCut } from '../src/contracts';

interface Props {
  sequenceName: string;
  totalBp: number;
  cuts: DigestCut[];
  selectedEnzymes: string[];
}

// Standard 1kb DNA Ladder bands (bp)
const LADDER_BANDS = [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500];

export default function VirtualGel({ sequenceName, totalBp, cuts, selectedEnzymes }: Props) {
  const maxBp = 10000;
  const minBp = 100;
  const gelWidth = 320;
  const gelHeight = 360;
  const laneYTop = 50;
  const laneYBottom = 330;

  // Logarithmic migration distance formula for agarose gel electrophoresis
  const bpToY = (bp: number) => {
    const clamped = Math.max(minBp, Math.min(maxBp, bp));
    const logMin = Math.log10(minBp);
    const logMax = Math.log10(maxBp);
    const fraction = (Math.log10(clamped) - logMin) / (logMax - logMin);
    // Invert because smaller fragments migrate further down
    return laneYBottom - fraction * (laneYBottom - laneYTop);
  };

  // Calculate fragment lengths from cuts
  const fragmentLengths = cuts.map((c) => c.fragment_length);
  if (cuts.length === 0 && selectedEnzymes.length > 0) {
    fragmentLengths.push(totalBp); // Uncut circular/linear DNA
  }

  return (
    <div className="virtual-gel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        Virtual Agarose Gel Simulator (1% Agarose)
      </h4>
      <svg
        width={gelWidth}
        height={gelHeight}
        viewBox={`0 0 ${gelWidth} ${gelHeight}`}
        style={{
          background: '#0B0F19', // Dark UV gel box background
          borderRadius: '8px',
          border: '2px solid var(--color-border-subtle, #1E293B)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Gel Wells */}
        <rect x="40" y="20" width="80" height="8" rx="2" fill="#1E293B" />
        <text x="80" y="16" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">
          Ladder
        </text>

        <rect x="180" y="20" width="100" height="8" rx="2" fill="#1E293B" />
        <text x="230" y="16" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">
          Digest Sample
        </text>

        {/* Lane 1: 1kb Ladder Bands */}
        {LADDER_BANDS.map((bp) => {
          const y = bpToY(bp);
          return (
            <g key={`ladder-${bp}`}>
              {/* Fluorescent EtBr/GelRed DNA Band */}
              <line
                x1="45"
                y1={y}
                x2="115"
                y2={y}
                stroke="#60A5FA" // Cyan UV glow
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.85"
                style={{ filter: 'drop-shadow(0 0 3px #3B82F6)' }}
              />
              <text x="35" y={y + 3} textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">
                {bp >= 1000 ? `${bp / 1000}k` : `${bp}`}
              </text>
            </g>
          );
        })}

        {/* Lane 2: Digest Sample Bands */}
        {fragmentLengths.map((fragLen, idx) => {
          const y = bpToY(fragLen);
          return (
            <g key={`frag-${idx}-${fragLen}`}>
              <line
                x1="185"
                y1={y}
                x2="275"
                y2={y}
                stroke="#38BDF8" // Bright cyan fluorescent glow
                strokeWidth="4"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 5px #0EA5E9)' }}
              />
              <text x="282" y={y + 3} textAnchor="start" fill="#F1F5F9" fontSize="10" fontFamily="monospace" fontWeight="600">
                {fragLen} bp
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
