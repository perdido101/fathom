import type { CardUiState } from '../../engine/types';
import { CARDS } from '../../content/cards';
import { Art } from '../../art/Art';
import { CardFrame } from '../../art/placeholders/Icons';

/**
 * A tray card. Availability is shown by rotating the card 90°, matching the
 * physical game — no badges, no countdown. The whole tray's state reads from
 * orientation alone at a glance.
 */
export function CardTile({
  typeId,
  state,
  cost,
  selected,
  onClick,
  showName = true,
}: {
  typeId: string;
  state: CardUiState;
  cost?: number;
  selected?: boolean;
  onClick?: () => void;
  showName?: boolean;
}) {
  const def = CARDS[typeId];
  if (!def) return null;
  const tag = def.tags.includes('attack')
    ? 'attack'
    : def.tags.includes('detect')
      ? 'detect'
      : 'utility';
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      className="trayCard"
      data-state={state}
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-label={`${def.name}, ${cost ?? def.cost} energy, ${state}`}
      style={{ background: 'none', border: 'none', padding: 0, flex: 'none' }}
    >
      <CardFrame tier={def.tier} state={state}>
        <span className="cardTop">
          <span className="cardCost">{cost ?? def.cost}</span>
          <span className={`tagDot tag-${tag}`} aria-hidden />
        </span>
        <span className="cardArt">
          <Art id={`card.${typeId}`} size={76} />
        </span>
        {showName && <span className="cardName">{def.name}</span>}
      </CardFrame>
    </Wrapper>
  );
}
