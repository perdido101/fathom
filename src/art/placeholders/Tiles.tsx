import type { ArtProps } from '../registry';
import { PALETTE } from '../tokens';

/**
 * Terrain tiles: seamlessly tileable motifs in boneFaint over deck. Each must
 * be identifiable in greyscale at 28px, so every tile is a distinct shape
 * family rather than a distinct colour.
 */
type TileKind = 'open' | 'reef' | 'fog' | 'trench' | 'shallows';

/** A corner hatch means "no ships may be placed here". */
function NoPlacement() {
  return (
    <path
      d="M96 4 L124 32 M108 4 L124 20"
      stroke={PALETTE.boneFaint}
      strokeWidth={5}
      strokeLinecap="round"
      opacity={0.9}
    />
  );
}

export function PlaceholderTile({ id, size = 32 }: ArtProps) {
  const kind = (id.replace(/^tile\./, '') as TileKind) ?? 'open';
  const stroke = PALETTE.boneFaint;
  const common = {
    viewBox: '0 0 128 128',
    width: size,
    height: size,
    role: 'img' as const,
    style: { display: 'block' as const },
  };
  // Trench reads one step darker, shallows one step lighter.
  const fill =
    kind === 'trench' ? PALETTE.hull : kind === 'shallows' ? PALETTE.panel : PALETTE.deck;

  return (
    <svg {...common} aria-label={kind}>
      <rect x={0} y={0} width={128} height={128} fill={fill} />
      <g fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" opacity={0.85}>
        {kind === 'open' && <circle cx={64} cy={64} r={3} fill={stroke} stroke="none" />}
        {kind === 'reef' && (
          <>
            <path d="M20 84 L44 56 L68 84 M56 44 L80 16 L104 44" />
            <path d="M28 108 L52 80 L76 108" opacity={0.6} />
          </>
        )}
        {kind === 'fog' && (
          <>
            <path d="M0 40 H128" opacity={0.9} />
            <path d="M0 64 H128" opacity={0.6} />
            <path d="M0 88 H128" opacity={0.9} />
          </>
        )}
        {kind === 'trench' && (
          <>
            <rect x={20} y={20} width={88} height={88} />
            <rect x={40} y={40} width={48} height={48} opacity={0.6} />
          </>
        )}
        {kind === 'shallows' && (
          <g fill={stroke} stroke="none">
            {[24, 64, 104].map((y) =>
              [24, 64, 104].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={4} />),
            )}
          </g>
        )}
      </g>
      {(kind === 'reef') && <NoPlacement />}
    </svg>
  );
}
