import type { ArtProps } from '../registry';
import { PALETTE } from '../tokens';

/**
 * Grid markers. These are read hundreds of times a match at roughly 28px on
 * the largest board, so legibility beats decoration: each is one shape, and
 * each is distinguishable in greyscale before colour is applied at all.
 *
 * Shape-first by design, so colourblind mode is a no-op rather than a
 * separate icon set: miss is a hollow ring, hit a filled disc, sunk a filled
 * cell with an X knocked out, probe a bracket, mine a starburst, decoy a
 * dashed ring.
 */
type MarkerKind = 'hit' | 'miss' | 'sunk' | 'probe' | 'mine' | 'decoy';

const COLOURS: Record<MarkerKind, string> = {
  miss: PALETTE.boneFaint,
  hit: PALETTE.green,
  sunk: PALETTE.red,
  probe: PALETTE.cyan,
  mine: PALETTE.amber,
  decoy: PALETTE.violet,
};

export function PlaceholderMarker({ id, size = 28, accent }: ArtProps) {
  const kind = (id.replace(/^marker\./, '') as MarkerKind) ?? 'miss';
  const c = accent ?? COLOURS[kind] ?? PALETTE.boneFaint;
  const common = {
    viewBox: '0 0 128 128',
    width: size,
    height: size,
    role: 'img' as const,
    style: { display: 'block' as const },
  };

  switch (kind) {
    case 'miss':
      return (
        <svg {...common} aria-label="Miss">
          <circle cx={64} cy={64} r={20} fill="none" stroke={c} strokeWidth={10} />
        </svg>
      );
    case 'hit':
      return (
        <svg {...common} aria-label="Hit">
          <circle cx={64} cy={64} r={30} fill={c} />
        </svg>
      );
    case 'sunk':
      return (
        <svg {...common} aria-label="Sunk">
          <rect x={12} y={12} width={104} height={104} rx={6} fill={c} />
          <path
            d="M38 38 L90 90 M90 38 L38 90"
            stroke={PALETTE.hull}
            strokeWidth={16}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'probe':
      return (
        <svg {...common} aria-label="Probe">
          <path
            d="M34 20 L20 20 L20 108 L34 108 M94 20 L108 20 L108 108 L94 108"
            fill="none"
            stroke={c}
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'mine':
      return (
        <svg {...common} aria-label="Mine">
          <circle cx={64} cy={64} r={22} fill={c} />
          <g stroke={c} strokeWidth={9} strokeLinecap="round">
            <path d="M64 18 V38 M64 90 V110 M18 64 H38 M90 64 H110" />
            <path d="M31 31 L45 45 M97 31 L83 45 M31 97 L45 83 M97 97 L83 83" />
          </g>
        </svg>
      );
    case 'decoy':
      return (
        <svg {...common} aria-label="Decoy">
          <circle
            cx={64}
            cy={64}
            r={26}
            fill="none"
            stroke={c}
            strokeWidth={10}
            strokeDasharray="14 12"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
