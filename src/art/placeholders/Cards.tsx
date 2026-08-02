import type { ArtProps } from '../registry';
import { PALETTE, ENCODING, idHash } from '../tokens';
import { CARDS } from '../../content/cards';

/**
 * Card art panels: portrait 3:4, art only. No frame and no text — the UI draws
 * name, cost and availability so they can be localised and restyled.
 *
 * A single centred glyph on a panel field over a faint concentric-arc
 * backdrop. The glyph is drawn in the card's tag colour; arc count and
 * rotation vary by a hash of the card id so no two cards look identical.
 */
function tagColour(cardId: string): string {
  const def = CARDS[cardId];
  if (!def) return PALETTE.bone;
  if (def.tags.includes('attack')) return PALETTE[ENCODING.tag.attack];
  if (def.tags.includes('detect')) return PALETTE[ENCODING.tag.detect];
  return PALETTE[ENCODING.tag.utility];
}

/** One glyph per effect family: crosshairs for fire, arcs for sensing. */
function Glyph({ cardId, colour }: { cardId: string; colour: string }) {
  const def = CARDS[cardId];
  const kind = def?.effect.kind ?? 'fire_cells';
  const s = { fill: 'none', stroke: colour, strokeWidth: 5, strokeLinecap: 'round' as const };

  switch (kind) {
    case 'fire_cells':
      return (
        <g {...s}>
          <circle cx={128} cy={128} r={44} />
          <path d="M128 60 V96 M128 160 V196 M60 128 H96 M160 128 H196" />
        </g>
      );
    case 'fire_scatter':
      return (
        <g {...s}>
          {[[92, 92], [164, 108], [116, 168]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={18} />
          ))}
        </g>
      );
    case 'fire_plus':
      return (
        <g {...s}>
          <path d="M128 64 V192 M64 128 H192" />
          <circle cx={128} cy={128} r={16} />
        </g>
      );
    case 'fire_row_sweep':
      return (
        <g {...s}>
          <path d="M56 96 H200 M56 128 H200 M56 160 H200" />
          <path d="M200 96 L216 128 L200 160" />
        </g>
      );
    case 'fire_torpedo':
      return (
        <g {...s}>
          <path d="M56 128 H176" />
          <path d="M176 104 L212 128 L176 152 Z" fill={colour} />
          <path d="M72 112 V144 M96 112 V144" strokeWidth={3} />
        </g>
      );
    case 'fire_zone':
      return (
        <g {...s}>
          <rect x={72} y={72} width={112} height={112} />
          <path d="M100 100 L156 156 M156 100 L100 156" strokeWidth={4} />
        </g>
      );
    case 'fire_marked_column':
      return (
        <g {...s}>
          <path d="M96 56 V200 M160 56 V200" />
          <path d="M128 64 V192" strokeWidth={4} strokeDasharray="10 12" />
        </g>
      );
    case 'probe_line':
      return (
        <g {...s}>
          <path d="M64 128 H192" />
          <circle cx={64} cy={128} r={10} />
          <circle cx={128} cy={128} r={10} />
          <circle cx={192} cy={128} r={10} />
        </g>
      );
    case 'fire_probe_adjacent':
      return (
        <g {...s}>
          <circle cx={128} cy={140} r={30} />
          <path d="M128 40 V96" />
          <path d="M108 60 L128 40 L148 60" />
        </g>
      );
    case 'probe_delayed':
      return (
        <g {...s}>
          <path d="M128 88 V176" />
          <circle cx={128} cy={72} r={18} />
          <path d="M84 184 Q128 208 172 184" />
        </g>
      );
    case 'probe_zone_count':
    case 'reveal_zone':
      return (
        <g {...s}>
          <circle cx={128} cy={128} r={12} fill={colour} />
          {[40, 68, 96].map((r, i) => (
            <path
              key={i}
              d={`M${128 - r} 128 A ${r} ${r} 0 0 1 ${128 + r} 128`}
              opacity={1 - i * 0.22}
            />
          ))}
        </g>
      );
    case 'energy_delayed':
      return (
        <g {...s}>
          <path d="M140 56 L92 136 H128 L116 200 L164 120 H128 Z" fill={colour} stroke="none" />
        </g>
      );
    case 'decoy':
      return (
        <g {...s}>
          <circle cx={128} cy={128} r={48} strokeDasharray="16 14" />
          <circle cx={128} cy={128} r={12} />
        </g>
      );
    case 'repair':
      return (
        <g {...s}>
          <path d="M76 128 H180" />
          <path d="M128 76 V180" />
          <rect x={96} y={96} width={64} height={64} strokeWidth={4} />
        </g>
      );
    case 'emp':
      return (
        <g {...s}>
          <circle cx={128} cy={128} r={20} fill={colour} stroke="none" />
          {[44, 76, 108].map((r, i) => (
            <circle key={i} cx={128} cy={128} r={r} opacity={1 - i * 0.25} strokeDasharray="8 14" />
          ))}
        </g>
      );
    case 'blockade':
      return (
        <g {...s}>
          <path d="M64 92 H192 M64 164 H192" />
          <path d="M88 60 V196 M168 60 V196" strokeWidth={4} />
        </g>
      );
    default:
      return (
        <g {...s}>
          <circle cx={128} cy={128} r={44} />
        </g>
      );
  }
}

export function PlaceholderCard({ id, size = 120 }: ArtProps) {
  const cardId = id.replace(/^card\./, '');
  const colour = tagColour(cardId);
  const seed = idHash(cardId);
  const arcs = 3 + (seed % 3);
  const rotation = (seed >> 4) % 360;

  return (
    <svg
      viewBox="0 0 256 341"
      width={size}
      height={(size * 341) / 256}
      role="img"
      aria-label={CARDS[cardId]?.name ?? 'Card'}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      <rect x={0} y={0} width={256} height={341} fill={PALETTE.panel} />
      {/* Faint concentric-arc backdrop, varied per card. */}
      <g
        fill="none"
        stroke={PALETTE.line}
        strokeWidth={2}
        transform={`rotate(${rotation} 128 170)`}
      >
        {Array.from({ length: arcs }, (_, i) => (
          <circle key={i} cx={128} cy={170} r={50 + i * 34} />
        ))}
      </g>
      <g transform="translate(0, 42)">
        <Glyph cardId={cardId} colour={colour} />
      </g>
    </svg>
  );
}
