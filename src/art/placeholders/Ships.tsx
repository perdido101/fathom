import type { ArtProps } from '../registry';
import { PALETTE, accentForShip, idHash } from '../tokens';
import { SHIPS } from '../../content/ships';

/**
 * Horizontal ship silhouettes, bow to the right, built from rectangles,
 * triangles and a hull curve. Length scales with size class and superstructure
 * complexity scales with it too: a size-1 skiff is a hull and one mast, a
 * size-5 dreadnought carries stacked towers and turrets.
 */
export function PlaceholderShip({ id, size = 64, state = 'normal', accent }: ArtProps) {
  const shipId = id.replace(/^ship\./, '');
  const def = SHIPS[shipId];
  const len = def?.size ?? 3;
  const stroke = accent ?? PALETTE[accentForShip(shipId)];
  const h = 64;
  const w = h * len;
  const seed = idHash(shipId);
  const opacity = state === 'sunk' ? 0.4 : 1;

  // Hull: a flat deck with a raked bow to the right and a squared stern.
  const deckY = 34;
  const keelY = 52;
  const bowX = w - 6;
  const hull = `M6 ${deckY} L${bowX - 10} ${deckY} L${bowX} ${(deckY + keelY) / 2} L${bowX - 12} ${keelY} L14 ${keelY} Q6 ${keelY} 6 ${keelY - 8} Z`;

  const towers = [];
  const unit = w / (len + 1);
  for (let i = 0; i < len; i++) {
    const cx = unit * (i + 0.75);
    const tall = 10 + ((seed >> (i * 3)) % 3) * 4;
    if (i === 0) {
      // Mast at the stern-most station.
      towers.push(<line key={`m${i}`} x1={cx} y1={deckY} x2={cx} y2={deckY - tall - 6} strokeWidth={1} />);
      towers.push(<line key={`y${i}`} x1={cx - 5} y1={deckY - tall - 2} x2={cx + 5} y2={deckY - tall - 2} strokeWidth={1} />);
    } else if (len >= 4 && i === len - 1) {
      // Turret: a squat block with a barrel, only on the big hulls.
      towers.push(<rect key={`t${i}`} x={cx - 8} y={deckY - 9} width={16} height={9} strokeWidth={1.5} fill={PALETTE.panel} />);
      towers.push(<line key={`b${i}`} x1={cx + 8} y1={deckY - 5} x2={cx + 18} y2={deckY - 5} strokeWidth={1.5} />);
    } else {
      towers.push(
        <rect key={`s${i}`} x={cx - 6} y={deckY - tall} width={12} height={tall} strokeWidth={1.5} fill={PALETTE.panel} />,
      );
      if (len >= 3) {
        towers.push(
          <rect key={`s2${i}`} x={cx - 3} y={deckY - tall - 6} width={6} height={6} strokeWidth={1} fill={PALETTE.panel} />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size * len}
      height={size}
      role="img"
      aria-label={def?.name ?? 'Ship'}
      style={{ display: 'block', opacity, maxWidth: '100%' }}
    >
      <g fill="none" stroke={stroke} strokeLinejoin="round" strokeLinecap="round">
        <path d={hull} fill={PALETTE.panel} strokeWidth={1.5} />
        {/* Waterline detail */}
        <line x1={12} y1={keelY - 5} x2={bowX - 14} y2={keelY - 5} strokeWidth={0.5} opacity={0.6} />
        {towers}
      </g>
    </svg>
  );
}
