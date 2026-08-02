import { useState } from 'react';
import { useGame } from '../../game/store';
import { SHIPS, SHIP_IDS } from '../../content/ships';
import { CARDS, CARD_IDS } from '../../content/cards';
import { TERRAIN, TERRAIN_IDS } from '../../content/terrain';
import { MODIFIERS, MODIFIER_IDS } from '../../content/modifiers';
import { Art } from '../../art/Art';
import { CardTile } from '../components/Card';

type Tab = 'rules' | 'hulls' | 'cards' | 'sea';

/**
 * The codex. The hull roster is public by design — knowing every hull that
 * can be in the deck is exactly what makes the draft trail worth reading.
 */
export function CodexScreen() {
  const { go } = useGame();
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn small ghost" onClick={() => go('title')}>
          Back
        </button>
        <h1>Codex</h1>
      </div>
      <div className="topbar" style={{ borderTop: 0 }}>
        {(['rules', 'hulls', 'cards', 'sea'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`btn small ${tab === t ? 'primary' : 'ghost'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="scroll">
        {tab === 'rules' && <Rules />}
        {tab === 'hulls' && <Hulls />}
        {tab === 'cards' && <Cards />}
        {tab === 'sea' && <Sea />}
      </div>
    </div>
  );
}

function Rules() {
  return (
    <>
      <div className="panel">
        <h2>Winning</h2>
        <p className="small dim">
          Sink every enemy hull. Players alternate turns; a run ends after two losses.
        </p>
      </div>
      <div className="panel">
        <h2>Energy</h2>
        <p className="small dim">
          You earn energy at the start of your turn, and one more the moment you hit a cell —
          spendable straight away. A cheap probe that lands two hits can pay for a card you could
          not afford when the turn began. Unspent energy banks with no cap, but waiting earns you
          nothing while your opponent is scoring.
        </p>
      </div>
      <div className="panel">
        <h2>Your tray</h2>
        <p className="small dim">
          No hand, no deck, no draw. Every card you draft stays with you. Playing a card turns it
          sideways — it sits out your next turn and returns the turn after. Basic Salvo never does,
          so you can always act.
        </p>
      </div>
      <div className="panel">
        <h2>What stays hidden</h2>
        <p className="small dim">
          Your opponent sees only the cards you have already played. Fleets are never declared: a
          sinking announces the hull's length, never its name, and names are revealed at match end.
          Hulls are drafted in packs of four — keep one, burn one, pass two on — so what you pass
          is the only trail you leave.
        </p>
      </div>
      <div className="panel">
        <h2>Deploying</h2>
        <p className="small dim">
          Ships lie in a straight line: across, down, or along either diagonal. They cannot overlap
          or sit on reef.
        </p>
      </div>
    </>
  );
}

function Hulls() {
  return (
    <div className="panel">
      <h2>The roster</h2>
      <p className="small dim">
        Every match deals all twenty hull cards. Knowing the roster is what makes the pack trail
        readable.
      </p>
      {SHIP_IDS.map((id) => {
        const def = SHIPS[id];
        return (
          <div key={id} style={{ marginBottom: 12 }}>
            <div className="shipRow">
              <Art id={`ship.${id}`} size={22} />
              <div>
                <strong>{def.name}</strong> <span className="mono dim">·{def.size}</span>
              </div>
            </div>
            <div className="tiny dim" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Art id={`icon.ability.${id}`} size={12} />
              {def.abilityName}
            </div>
            <div className="small faint">{def.abilityText}</div>
          </div>
        );
      })}
    </div>
  );
}

function Cards() {
  return (
    <div className="panel">
      <h2>Cards</h2>
      {CARD_IDS.map((id) => {
        const def = CARDS[id];
        return (
          <div key={id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <CardTile typeId={id} state="ready" showName={false} />
            <div style={{ minWidth: 0 }}>
              <strong>{def.name}</strong>{' '}
              <span className="mono dim">
                {def.cost}e {def.tier === 0 ? '· permanent' : `· T${def.tier}`}
              </span>
              <div className="small faint">{def.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sea() {
  return (
    <>
      <div className="panel">
        <h2>Terrain</h2>
        {TERRAIN_IDS.map((id) => (
          <div key={id} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
            <Art id={`tile.${id.toLowerCase()}`} size={30} />
            <div>
              <strong>{TERRAIN[id].name}</strong>
              <div className="small faint">{TERRAIN[id].text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Conditions</h2>
        <p className="small dim">
          One is drawn face up at the start of every match and applies to both players. Each one
          twists a single terrain rule.
        </p>
        {MODIFIER_IDS.map((id) => (
          <div key={id} style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--violet)' }}>{MODIFIERS[id].name}</strong>
            <div className="small faint">{MODIFIERS[id].text}</div>
          </div>
        ))}
      </div>
    </>
  );
}
