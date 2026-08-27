import { useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import { Board } from '../components/Board';
import { CardBack, GameCard } from '../components/GameCard';

/**
 * How to play, as five things you do rather than five things you read. Each
 * step is a live control that behaves the way the real one does.
 *
 * The draft came first in Build 6 because it happens first, and because blind
 * simultaneous picking with legal duplicates is the one rule in this game
 * nobody arrives already knowing.
 */
export function HowToPlay(): ReactElement {
  const go = useStore((s) => s.go);
  const [step, setStep] = useState(0);
  const steps = [Drafting, Charging, Firing, Simultaneous, Sinks];
  const Step = steps[step];

  return (
    <div className="screen centered" style={{ gap: 20 }}>
      <div className="panel" style={{ width: 'min(860px, 92%)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>How to play</h2>
          <div className="row" style={{ gap: 6 }}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 30,
                  height: 8,
                  borderRadius: 4,
                  background: i <= step ? 'var(--gold)' : 'var(--panel-dim)',
                }}
              />
            ))}
          </div>
        </div>
        <Step />
        <div className="row">
          <button
            className="btn ghost"
            style={{ flex: 1 }}
            onClick={() => (step === 0 ? go('menu') : setStep(step - 1))}
          >
            {step === 0 ? 'Back' : 'Previous'}
          </button>
          <button
            className="btn go"
            style={{ flex: 2 }}
            onClick={() => (step === steps.length - 1 ? go('menu') : setStep(step + 1))}
          >
            {step === steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The draft, taught with the same live-card treatment the charging step uses:
 * pick one of four and watch what the opponent picking the same one does.
 */
function Drafting(): ReactElement {
  const [mine, setMine] = useState<string | null>(null);
  // Fixed, not random: a tutorial that behaves differently on two readings
  // teaches two different rules.
  const theirs = 'burst';
  const pack = ['salvo', 'burst', 'echo', 'mirror'];
  const collided = mine === theirs;
  return (
    <div className="col">
      <h3>The draft is blind, and duplicates are legal</h3>
      <p>
        You both see the same four. You both pick in secret. If you happen to reach for the same
        one, you <strong>both</strong> get it — and that is the only thing either of you learns
        about the other&rsquo;s hand all draft.
      </p>
      <div className="row" style={{ gap: 14, justifyContent: 'center', padding: '10px 0' }}>
        {pack.map((id) => (
          <GameCard
            key={id}
            defId={id}
            charges={0}
            size="md"
            selected={mine === id}
            style={
              mine && mine !== id
                ? { opacity: 0.4, transform: 'scale(0.95)' }
                : undefined
            }
            onClick={() => setMine(id)}
          />
        ))}
        {mine && (
          <div className="their-pick">
            {collided ? (
              <GameCard defId={theirs} charges={0} size="md" />
            ) : (
              <div
                className="their-back"
                style={{ width: 148, position: 'relative', aspectRatio: '2 / 3' }}
              >
                <CardBack label="THEIRS" />
              </div>
            )}
          </div>
        )}
      </div>
      <p style={{ fontWeight: 800 }}>
        {mine === null
          ? 'Pick one. They are picking at the same moment.'
          : collided
            ? 'Collision — you both take Burst, and you both know it.'
            : 'They took one of the other three. You will not learn which.'}
      </p>
    </div>
  );
}

function Charging(): ReactElement {
  const [charges, setCharges] = useState([0, 0, 0]);
  const placed = charges.reduce((a, b) => a + b, 0);
  return (
    <div className="col">
      <h3>Charging</h3>
      <p>
        Every round you place exactly one charge on one card. Not optional, not skippable. Charges
        are public — you can always see theirs and they can always see yours.
      </p>
      <div className="row" style={{ gap: 20, justifyContent: 'center', padding: '10px 0' }}>
        {['salvo', 'burst', 'mirror'].map((id, i) => (
          <GameCard
            key={id}
            defId={id}
            charges={charges[i]}
            size="md"
            pulse={charges[i] > 0}
            onClick={() => setCharges(charges.map((c, j) => (j === i ? c + 1 : c)))}
          />
        ))}
      </div>
      <p style={{ fontWeight: 800 }}>
        {placed === 0
          ? 'Click a card to charge it.'
          : `${placed} rounds of charging. Bigger every round you wait.`}
      </p>
    </div>
  );
}

function Firing(): ReactElement {
  const [gone, setGone] = useState(false);
  return (
    <div className="col">
      <h3>Firing spends everything</h3>
      <p>
        A card fires at whatever it holds, spends all of it, and is destroyed permanently. It does
        not come back to your hand or the pile. The only question you ever ask is: now, or bigger
        later?
      </p>
      <div className="row" style={{ gap: 24, justifyContent: 'center', padding: '10px 0' }}>
        {gone ? (
          <div
            className="panel"
            style={{ width: 148, aspectRatio: '2/3', display: 'grid', placeItems: 'center', opacity: 0.5 }}
          >
            <span style={{ fontWeight: 800, color: 'var(--ink-faint)' }}>destroyed</span>
          </div>
        ) : (
          <GameCard defId="salvo" charges={5} size="md" onClick={() => setGone(true)} />
        )}
        <p style={{ maxWidth: 320, fontWeight: 700 }}>
          {gone
            ? 'Five charges spent, five cells fired at, and Salvo is out of the match.'
            : 'Click to fire it at five charges.'}
        </p>
      </div>
      <p style={{ fontSize: 'var(--fs-fine)' }}>
        Ambush is the only card that does anything at zero. Everything else needs at least one.
      </p>
    </div>
  );
}

function Simultaneous(): ReactElement {
  return (
    <div className="col">
      <h3>Both plans resolve at once</h3>
      <p>
        You never wait for a turn. Both players plan inside the same twenty seconds, both reveal,
        and all the damage is worked out against the same board — so a ship that dies this round
        still lands every shot it fired.
      </p>
      <p style={{ fontSize: 'var(--fs-fine)' }}>
        That is why the order matters: interference first, then reads, then attacks together, then
        sinks, then anything a dying ship does on its way down.
      </p>
    </div>
  );
}

function Sinks(): ReactElement {
  const marks: Record<number, 'hit' | 'miss'> = { 8: 'hit', 9: 'hit', 10: 'hit', 3: 'miss', 20: 'miss' };
  return (
    <div className="col">
      <h3>A sink tells you a length</h3>
      <p>
        When a ship goes down you are told how long it was — never what it was. Every fleet is one
        4, one 3 and one 2, so the length tells you which slot died, and their pack of four still
        has three candidates in it.
      </p>
      <div style={{ width: 260, alignSelf: 'center' }}>
        <Board marks={marks} compact />
      </div>
      <p style={{ fontSize: 'var(--fs-fine)' }}>
        Their ships only name themselves by acting. Using an ability flips that ship face up
        forever — but it never says where it is.
      </p>
    </div>
  );
}
