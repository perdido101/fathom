import type { CSSProperties, ReactElement } from 'react';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { Icon, hasIcon } from '../art/Icon';
import { artUrl } from '../art/dropin';
import { ChargeNumber } from './ChargeNumber';

/**
 * The card, as a card.
 *
 * One component used everywhere a card appears — hand, drafts, result,
 * inventory — so a card looks like the same object wherever the player meets
 * it. Portrait 2:3, coloured frame by role, an art window in the top 60%
 * (a composed gradient-and-icon treatment until real art lands), a name
 * banner, the short rule on the face, the full rule in a hover tooltip, and
 * the charge gem in the corner as the biggest number on the card.
 */

const ROLE_COLOUR: Record<string, string> = {
  attack: 'var(--attack)',
  intel: 'var(--intel)',
  control: 'var(--control)',
  prediction: 'var(--predict)',
};

const ROLE_ART: Record<string, [string, string]> = {
  attack: ['#ff9d7a', '#d63f1e'],
  intel: ['#63e0f5', '#0e8fb0'],
  control: ['#c39aff', '#6f2ed9'],
  prediction: ['#ffc46b', '#e07c00'],
};

export type CardSize = 'sm' | 'md' | 'lg';

const WIDTHS: Record<CardSize, number> = { sm: 96, md: 148, lg: 190 };

export function GameCard({
  defId,
  charges,
  size = 'md',
  faceDown = false,
  selected = false,
  disabled = false,
  pulse = false,
  onClick,
  className,
  style,
}: {
  defId: string | null;
  charges: number;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** The gem pulses when this card took a charge this round. */
  pulse?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}): ReactElement {
  const def = defId ? CARDS[defId] : null;
  const width = WIDTHS[size];
  const role = def?.role ?? 'attack';
  const frame = faceDown ? 'rgba(255,255,255,0.7)' : ROLE_COLOUR[role];
  const [artA, artB] = ROLE_ART[role];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`gamecard has-tip ${className ?? ''}`}
      aria-label={faceDown ? 'face-down card' : (def?.name ?? 'card')}
      style={{
        position: 'relative',
        width,
        aspectRatio: '2 / 3',
        borderRadius: size === 'sm' ? 10 : 16,
        border: `${size === 'sm' ? 2 : 3}px solid ${selected ? 'var(--gold)' : frame}`,
        background: 'var(--panel)',
        boxShadow: selected
          ? '0 0 0 4px rgba(255,197,49,0.45), var(--shadow-soft)'
          : 'var(--shadow-soft)',
        padding: 0,
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
        transition: 'transform var(--t-fast), box-shadow var(--t-fast)',
        flex: 'none',
        ...style,
      }}
    >
      {faceDown ? (
        <CardBack />
      ) : (
        <>
          {/* Art window: top 60%. Real art when a file has been dropped in;
              otherwise a composed treatment, not a grey box — the role
              gradient, a watermark of the glyph, and the glyph itself. */}
          <div
            style={{
              position: 'relative',
              height: '58%',
              borderRadius: `${size === 'sm' ? 7 : 12}px ${size === 'sm' ? 7 : 12}px 0 0`,
              background: `radial-gradient(120% 90% at 30% 15%, ${artA} 0%, ${artB} 75%)`,
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {def && artUrl(`cards/${def.id}`) && (
              <img
                src={artUrl(`cards/${def.id}`) ?? undefined}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            <span style={{ position: 'absolute', inset: 0, background: 'var(--gloss)' }} />
            {def && !artUrl(`cards/${def.id}`) && hasIcon(`card.${def.id}`) && (
              <>
                <Icon
                  name={`card.${def.id}`}
                  size={width * 0.9}
                  style={{
                    position: 'absolute',
                    right: '-18%',
                    bottom: '-22%',
                    color: 'rgba(255,255,255,0.14)',
                  }}
                />
                <Icon
                  name={`card.${def.id}`}
                  size={width * 0.42}
                  style={{
                    color: '#ffffff',
                    filter: 'drop-shadow(0 4px 6px rgba(18,58,94,0.45))',
                  }}
                />
              </>
            )}
          </div>

          {/* Name banner. */}
          <div
            style={{
              padding: size === 'sm' ? '3px 6px' : '5px 10px',
              background: frame,
              color: '#ffffff',
              fontFamily: 'var(--display)',
              fontWeight: 800,
              fontSize: size === 'sm' ? 10 : size === 'md' ? 14 : 17,
              textShadow: '0 1px 0 rgba(18,58,94,0.4)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {def?.name}
          </div>

          {/* Short rule on the face; the full rule rides the tooltip. */}
          {size !== 'sm' && (
            <div
              style={{
                flex: 1,
                padding: size === 'md' ? '5px 8px' : '7px 10px',
                fontSize: size === 'md' ? 10.5 : 12,
                fontWeight: 700,
                lineHeight: 1.3,
                color: 'var(--ink-dim)',
                overflow: 'hidden',
              }}
            >
              {def?.short}
            </div>
          )}

          {/* The charge gem. The biggest number on the card, on purpose. */}
          <span
            className={`gem ${size === 'sm' ? 'small' : size === 'lg' ? 'big' : ''} ${pulse ? 'pulse' : ''}`}
            style={{
              position: 'absolute',
              right: size === 'sm' ? -6 : -10,
              bottom: size === 'sm' ? -6 : -10,
              fontSize: size === 'sm' ? 14 : size === 'lg' ? 28 : 21,
            }}
          >
            <ChargeNumber
              value={charges}
              size={size === 'sm' ? 14 : size === 'lg' ? 28 : 21}
              style={{ color: '#5c3d00', textShadow: 'none' }}
            />
          </span>

          {def && (
            <span className="tip" role="tooltip">
              <strong style={{ display: 'block', marginBottom: 4 }}>{def.name}</strong>
              {def.text}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/** The face-down back: draw pile, unrevealed states. One design everywhere. */
export function CardBack({ label }: { label?: string }): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        background:
          'radial-gradient(110% 80% at 50% 20%, #59b7ff 0%, #2e7fd9 60%, #1c5aa8 100%)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', inset: 0, background: 'var(--gloss)' }} />
      <svg viewBox="0 0 100 100" width="46%" aria-hidden>
        <path d="M10 62 L50 22 L90 62 L74 62 L50 40 L26 62 Z" fill="rgba(255,255,255,0.55)" />
        <path d="M10 82 L50 42 L90 82 L74 82 L50 60 L26 82 Z" fill="rgba(255,255,255,0.85)" />
      </svg>
      {label && (
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            fontFamily: 'var(--display)',
            fontWeight: 800,
            fontSize: 11,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * A ship as a card, landscape, with its length shown as pips. The same
 * component covers the unrevealed enemy state — a card back that admits only
 * the length, because that is all the rules make public.
 */
export function ShipCard({
  defId,
  length,
  revealed = true,
  sunk = false,
  used = false,
  selected = false,
  size = 'md',
  onClick,
  className,
}: {
  defId: string | null;
  length: number;
  revealed?: boolean;
  sunk?: boolean;
  used?: boolean;
  selected?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
}): ReactElement {
  const def = defId && revealed ? SHIPS[defId] : null;
  const typeColour =
    def?.type === 'ACTIVE'
      ? 'var(--confirm)'
      : def?.type === 'NERF'
        ? 'var(--control)'
        : def?.type === 'REACT'
          ? 'var(--predict)'
          : 'rgba(255,255,255,0.6)';
  const h = size === 'sm' ? 52 : 72;

  // A ship card with no click handler renders as a span, because it often
  // sits inside something that is itself a button — a draft pick, a result
  // row — and a button inside a button is invalid DOM that React rightly
  // shouts about.
  const Root = (onClick ? 'button' : 'span') as 'button';

  return (
    <Root
      onClick={onClick}
      className={`has-tip ${className ?? ''}`}
      aria-label={def ? def.name : `unknown ${length}-length ship`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: h,
        padding: '0 14px',
        borderRadius: 14,
        border: `3px solid ${selected ? 'var(--gold)' : def ? typeColour : 'rgba(255,255,255,0.6)'}`,
        background: def
          ? 'var(--panel)'
          : 'linear-gradient(180deg, #59b7ff, #2e7fd9)',
        boxShadow: 'var(--shadow-soft)',
        opacity: sunk ? 0.45 : 1,
        transition: 'transform var(--t-fast)',
        textAlign: 'left',
        flex: 'none',
      }}
    >
      {def && hasIcon(`ship.${def.id}`) ? (
        <Icon name={`ship.${def.id}`} size={size === 'sm' ? 22 : 30} style={{ color: typeColour }} />
      ) : (
        <span
          style={{
            fontFamily: 'var(--display)',
            fontWeight: 800,
            fontSize: size === 'sm' ? 18 : 24,
            color: '#ffffff',
            textShadow: '0 2px 0 rgba(18,58,94,0.35)',
          }}
        >
          ?
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--display)',
            fontWeight: 800,
            fontSize: size === 'sm' ? 13 : 15,
            color: def ? 'var(--ink)' : '#ffffff',
            whiteSpace: 'nowrap',
          }}
        >
          {def ? def.name : `Length ${length}`}
        </span>
        {/* Length pips — sunk pips go hollow. */}
        <span style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length }, (_, i) => (
            <i
              key={i}
              style={{
                width: size === 'sm' ? 8 : 10,
                height: size === 'sm' ? 8 : 10,
                borderRadius: 3,
                background: sunk ? 'transparent' : def ? typeColour : 'rgba(255,255,255,0.85)',
                border: `2px solid ${sunk ? 'var(--danger)' : def ? typeColour : 'rgba(255,255,255,0.85)'}`,
              }}
            />
          ))}
        </span>
      </span>
      {def && (
        <span
          style={{
            marginLeft: 4,
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: 10,
            color: sunk ? 'var(--danger)' : used ? 'var(--ink-faint)' : typeColour,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {sunk ? 'sunk' : used ? 'spent' : def.type}
        </span>
      )}
      {def && (
        <span className="tip" role="tooltip">
          <strong style={{ display: 'block', marginBottom: 4 }}>
            {def.name} · {def.type}
          </strong>
          {def.text}
        </span>
      )}
    </Root>
  );
}
