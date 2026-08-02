import { useGame } from '../../game/store';
import { CARDS } from '../../content/cards';
import { CardTile } from '../components/Card';
import { currentPicker } from '../../engine/draft/cardDraft';

/**
 * Action cards draft from a shared, fully visible row in snake order.
 * Cards public, ships hidden: seeing and counter-drafting your opponent's
 * tools is the part of the draft that rewards reading them.
 */
export function DraftCardsScreen() {
  const { cardDraft, submitCardPick, humanSide } = useGame();
  if (!cardDraft) return null;
  const turn = currentPicker(cardDraft);
  const yourTurn = turn === humanSide;
  const theirs = cardDraft.keeps[humanSide === 0 ? 1 : 0];
  const mine = cardDraft.keeps[humanSide];
  const remaining = cardDraft.order.length - cardDraft.idx;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>The row</h1>
        <span className="chip" data-on={yourTurn ? 'true' : undefined}>
          {yourTurn ? 'Your pick' : 'Their pick'}
        </span>
      </div>

      <div className="scroll">
        <div className="panel">
          <h2>Shared row · {remaining} pick{remaining === 1 ? '' : 's'} left</h2>
          <p className="small dim">
            The row runs short, so the last picker goes hungry. Take what you need, or take what
            they need.
          </p>
          <div className="rowGrid">
            {cardDraft.pool.map((id, i) => (
              <div key={`${id}-${i}`} style={{ display: 'flex', justifyContent: 'center' }}>
                <CardTile
                  typeId={id}
                  state="ready"
                  onClick={yourTurn ? () => submitCardPick(id) : undefined}
                />
              </div>
            ))}
          </div>
          {cardDraft.pool.length > 0 && (
            <p className="small faint" style={{ marginTop: 8 }}>
              {CARDS[cardDraft.pool[0]] ? 'Tap a card to take it.' : ''}
            </p>
          )}
        </div>

        <div className="panel">
          <h2>Taken</h2>
          <div className="small dim">You</div>
          <div className="chipRow" style={{ marginBottom: 8 }}>
            {mine.length === 0 ? (
              <span className="chip">nothing yet</span>
            ) : (
              mine.map((id, i) => (
                <span key={i} className="chip" data-on="true">
                  {CARDS[id].name}
                </span>
              ))
            )}
          </div>
          <div className="small dim">Them</div>
          <div className="chipRow">
            {theirs.length === 0 ? (
              <span className="chip">nothing yet</span>
            ) : (
              theirs.map((id, i) => (
                <span key={i} className="chip">
                  {CARDS[id].name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
