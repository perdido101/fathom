import type { CSSProperties, ReactElement } from 'react';
import { SHIPS } from '../../engine/ships';
import { CARDS } from '../../engine/cards';

/**
 * Placeholder art, drawn in code.
 *
 * Everything here is a coloured shape with a legible label at the right aspect
 * ratio and the right position. The game is fully playable on these, which is
 * the bar the build prompt sets — and when the real stylised 3D renders arrive
 * they replace the body of these three functions and nothing else. The asset
 * manifest lists exactly what each one expects.
 */

const SHIP_TINT: Record<string, string> = {
  dreadnought: '#5b6f95',
  forge: '#c96a3a',
  blackout: '#3d4a63',
  warhead: '#b4453f',
  kiln: '#d08a35',
  leech: '#6d4a86',
  cinder: '#a8552f',
  beacon: '#3d8fb0',
  spite: '#8c3b52',
  ember: '#cf7a37',
  pin: '#4b7f6a',
  thorn: '#7a5f3a',
};

const ROLE_TINT: Record<string, string> = {
  attack: '#b4453f',
  intel: '#3d8fb0',
  control: '#6d4a86',
  prediction: '#c9a13a',
};

/** A ship silhouette: a hull rectangle of the right length, plus a marker. */
export function ShipArt({
  defId,
  length,
  vertical = false,
  revealed = true,
  size = 34,
}: {
  defId: string | null;
  length: number;
  vertical?: boolean;
  revealed?: boolean;
  size?: number;
}): ReactElement {
  // An unidentified hull is a slab of the same grey whatever it turns out to
  // be, so the silhouette gives nothing away before the ship reveals itself.
  const colour = defId && revealed ? SHIP_TINT[defId] ?? '#4a5a75' : '#2a3550';
  const w = vertical ? size : size * length;
  const h = vertical ? size * length : size;
  return (
    <svg
      viewBox={`0 0 ${vertical ? 100 : 100 * length} ${vertical ? 100 * length : 100}`}
      width={w}
      height={h}
      role="img"
      aria-label={defId && revealed ? SHIPS[defId]?.name : `unknown ${length}-hull`}
    >
      <rect
        x="4"
        y="4"
        width={(vertical ? 100 : 100 * length) - 8}
        height={(vertical ? 100 * length : 100) - 8}
        rx="26"
        fill={colour}
        stroke="#0b1220"
        strokeWidth="6"
      />
      <text
        x={(vertical ? 100 : 100 * length) / 2}
        y={(vertical ? 100 * length : 100) / 2 + 16}
        textAnchor="middle"
        fontSize="44"
        fontWeight="800"
        fill="#0b1220"
        opacity="0.75"
      >
        {defId && revealed ? SHIPS[defId]?.name.slice(0, 2).toUpperCase() : length}
      </text>
    </svg>
  );
}

/** A card face: a coloured frame, the name, the charge number and the text. */
export function CardArt({
  defId,
  charges,
  faceDown = false,
  selected = false,
  disabled = false,
  onClick,
  style,
}: {
  defId: string | null;
  charges: number;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}): ReactElement {
  const def = defId ? CARDS[defId] : null;
  const tint = def ? ROLE_TINT[def.role] : '#243349';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'relative',
        aspectRatio: '2 / 3',
        borderRadius: 10,
        background: faceDown
          ? 'repeating-linear-gradient(135deg,#16233a 0 6px,#1b2a44 6px 12px)'
          : `linear-gradient(170deg, ${tint}44, #101a2b 62%)`,
        border: `1px solid ${selected ? 'var(--charge)' : 'var(--panel-edge)'}`,
        boxShadow: selected ? '0 0 0 2px var(--charge-glow) inset' : 'none',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textAlign: 'left',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform var(--t-fast), box-shadow var(--t-fast)',
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: faceDown ? 'var(--ink-faint)' : tint,
          fontWeight: 700,
        }}
      >
        {faceDown ? 'hidden' : def?.role}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15 }}>
        {faceDown ? '???' : def?.name}
      </span>
      {!faceDown && def && (
        <span
          style={{
            fontSize: 9,
            color: 'var(--ink-faint)',
            lineHeight: 1.3,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {def.text}
        </span>
      )}
      <span className="charges" style={{ fontSize: 26, lineHeight: 1, alignSelf: 'flex-end' }}>
        {charges}
      </span>
    </button>
  );
}

/** The wordmark. Two overlapping chevrons, one shadowed — a fleet in echelon. */
export function Wordmark({ size = 44 }: { size?: number }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <path d="M10 62 L50 22 L90 62 L74 62 L50 40 L26 62 Z" fill="#2a3d5c" />
        <path d="M10 82 L50 42 L90 82 L74 82 L50 60 L26 82 Z" fill="var(--sol)" opacity="0.9" />
      </svg>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: size * 0.52, fontWeight: 800, letterSpacing: '-0.02em' }}>
          SHADOW
        </div>
        <div
          style={{
            fontSize: size * 0.34,
            fontWeight: 600,
            letterSpacing: '0.34em',
            color: 'var(--sol)',
          }}
        >
          ARMADA
        </div>
      </div>
    </div>
  );
}

/** Every placeholder the build ships with, for the asset manifest to mirror. */
export const ART_KINDS = ['ship', 'card', 'wordmark'] as const;
