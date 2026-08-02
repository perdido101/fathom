import type { ArtProps } from '../registry';
import { PALETTE } from '../tokens';
import { SHIPS } from '../../content/ships';

/**
 * Ship ability icons: 64×64, single colour, one idea each, no scene.
 * Must read at 24px, so every icon is a single closed shape or a short stroke
 * path — nothing that relies on interior detail.
 */
export function PlaceholderAbilityIcon({ id, size = 24, accent }: ArtProps) {
  const shipId = id.replace(/^icon\.ability\./, '');
  const ability = SHIPS[shipId]?.ability ?? 'silent';
  const c = accent ?? PALETTE.bone;
  const s = { fill: 'none', stroke: c, strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const common = { viewBox: '0 0 64 64', width: size, height: size, role: 'img' as const, style: { display: 'block' as const } };

  switch (ability) {
    case 'silent': // a muted signal — arcs with a bar through them
      return (
        <svg {...common} aria-label="Silent Running">
          <g {...s}>
            <circle cx={32} cy={32} r={7} />
            <path d="M18 18 A 20 20 0 0 0 18 46" />
            <path d="M46 18 A 20 20 0 0 1 46 46" />
            <path d="M14 50 L50 14" strokeWidth={5} />
          </g>
        </svg>
      );
    case 'swift': // motion — chevrons
      return (
        <svg {...common} aria-label="Swift">
          <g {...s}>
            <path d="M14 20 L30 32 L14 44" />
            <path d="M32 20 L48 32 L32 44" />
          </g>
        </svg>
      );
    case 'camouflage': // broken outline
      return (
        <svg {...common} aria-label="Camouflage">
          <g {...s}>
            <rect x={14} y={14} width={36} height={36} rx={4} strokeDasharray="9 8" />
          </g>
        </svg>
      );
    case 'supply': // fuel drop
      return (
        <svg {...common} aria-label="Supply">
          <path d="M32 12 C 44 28 50 36 50 42 A 18 18 0 0 1 14 42 C 14 36 20 28 32 12 Z" fill={c} />
        </svg>
      );
    case 'retaliate': // returning arrow
      return (
        <svg {...common} aria-label="Retaliate">
          <g {...s}>
            <path d="M50 26 A 18 18 0 1 1 32 14" />
            <path d="M20 12 L32 14 L28 26" />
          </g>
        </svg>
      );
    case 'deploy': // mine
      return (
        <svg {...common} aria-label="Deploy">
          <circle cx={32} cy={32} r={11} fill={c} />
          <g stroke={c} strokeWidth={5} strokeLinecap="round">
            <path d="M32 8 V17 M32 47 V56 M8 32 H17 M47 32 H56" />
          </g>
        </svg>
      );
    case 'array': // sensor arcs
      return (
        <svg {...common} aria-label="Array">
          <g {...s}>
            <circle cx={32} cy={44} r={5} fill={c} stroke="none" />
            <path d="M18 44 A 14 14 0 0 1 46 44" />
            <path d="M9 44 A 23 23 0 0 1 55 44" opacity={0.6} />
          </g>
        </svg>
      );
    case 'launch': // aircraft
      return (
        <svg {...common} aria-label="Launch">
          <path d="M32 8 L40 34 L58 44 L34 40 L32 58 L30 40 L6 44 L24 34 Z" fill={c} />
        </svg>
      );
    case 'armored': // layered shield
      return (
        <svg {...common} aria-label="Armored">
          <g {...s}>
            <path d="M32 8 L52 16 V34 C52 46 32 56 32 56 C32 56 12 46 12 34 V16 Z" />
            <path d="M32 18 L42 22 V34 C42 40 32 45 32 45" strokeWidth={4} opacity={0.7} />
          </g>
        </svg>
      );
    case 'wake': // spiral
      return (
        <svg {...common} aria-label="Wake">
          <g {...s}>
            <path d="M32 32 A 6 6 0 1 1 26 32 A 12 12 0 1 0 44 32 A 20 20 0 1 1 14 32" />
          </g>
        </svg>
      );
    default:
      return (
        <svg {...common} aria-label="Ability">
          <circle cx={32} cy={32} r={18} fill="none" stroke={c} strokeWidth={5} />
        </svg>
      );
  }
}

/** Card frames — real components, not placeholders. Tier via weight, not decor. */
export function CardFrame({
  tier,
  children,
  state = 'ready',
}: {
  tier: 0 | 1 | 2 | 3;
  children?: React.ReactNode;
  state?: 'ready' | 'expensive' | 'unavailable' | 'spent';
}) {
  const colour =
    tier === 3 ? PALETTE.magenta : tier === 2 ? PALETTE.amber : PALETTE.bone;
  const weight = tier === 3 ? 2 : tier === 2 ? 1.5 : 1;
  const clipped = tier >= 2;
  return (
    <div
      className="cardFrame"
      data-state={state}
      style={{
        borderColor: colour,
        borderWidth: weight,
        clipPath: clipped
          ? 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
          : undefined,
      }}
    >
      {tier === 3 && <span className="cardFrameInner" style={{ borderColor: colour }} />}
      {children}
    </div>
  );
}

/** UI marks: energy cube, unavailable rotation hint, seed badge, bot badge. */
export function PlaceholderUi({ id, size = 20, accent }: ArtProps) {
  const kind = id.replace(/^ui\./, '');
  const common = { viewBox: '0 0 64 64', width: size, height: size, role: 'img' as const, style: { display: 'block' as const } };
  switch (kind) {
    case 'energy':
      return (
        <svg {...common} aria-label="Energy">
          <path d="M36 6 L16 34 H30 L26 58 L48 28 H32 Z" fill={accent ?? PALETTE.amber} />
        </svg>
      );
    case 'seed_badge':
      return (
        <svg {...common} aria-label="Seed">
          <g fill="none" stroke={accent ?? PALETTE.boneDim} strokeWidth={4}>
            <circle cx={32} cy={32} r={20} />
            <path d="M32 12 V52 M12 32 H52" opacity={0.5} />
          </g>
        </svg>
      );
    case 'bot':
      return (
        <svg {...common} aria-label="Bot">
          <g fill="none" stroke={accent ?? PALETTE.cyan} strokeWidth={4} strokeLinejoin="round">
            <rect x={14} y={20} width={36} height={28} rx={5} />
            <path d="M32 20 V10" />
            <circle cx={24} cy={34} r={3} fill={accent ?? PALETTE.cyan} />
            <circle cx={40} cy={34} r={3} fill={accent ?? PALETTE.cyan} />
          </g>
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Wordmark: wide, slightly condensed, all-caps geometric letterforms with a
 * scanline break through the middle third, as if a sonar sweep were passing
 * across the display. Bone letters, green showing through the gap.
 */
export function Wordmark({ size = 240, text = 'FATHOM' }: { size?: number; text?: string }) {
  const h = size / 5;
  const gapTop = h * 0.42;
  const gapH = h * 0.16;
  return (
    <svg
      viewBox={`0 0 ${size} ${h}`}
      width={size}
      height={h}
      role="img"
      aria-label={text}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      <defs>
        <clipPath id="wm-top">
          <rect x={0} y={0} width={size} height={gapTop} />
        </clipPath>
        <clipPath id="wm-bot">
          <rect x={0} y={gapTop + gapH} width={size} height={h} />
        </clipPath>
      </defs>
      {/* Green sits inside the letterforms, so the sweep shows through the
          gap in each letter rather than striking through the whole word. */}
      <text
        x={size / 2}
        y={h * 0.78}
        textAnchor="middle"
        fill={PALETTE.green}
        style={{
          fontFamily: '"Barlow Condensed", "Oswald", system-ui, sans-serif',
          fontWeight: 700,
          fontSize: h * 0.92,
          letterSpacing: h * 0.14,
        }}
      >
        {text}
      </text>
      {(['wm-top', 'wm-bot'] as const).map((clip) => (
        <text
          key={clip}
          x={size / 2}
          y={h * 0.78}
          textAnchor="middle"
          clipPath={`url(#${clip})`}
          fill={PALETTE.bone}
          style={{
            fontFamily: '"Barlow Condensed", "Oswald", system-ui, sans-serif',
            fontWeight: 700,
            fontSize: h * 0.92,
            letterSpacing: h * 0.14,
          }}
        >
          {text}
        </text>
      ))}
    </svg>
  );
}
