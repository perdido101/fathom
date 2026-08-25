import { useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import { Board } from '../components/Board';
import { CardArt } from '../art/registry';

/**
 * How to play, as four things you do rather than four things you read.
 *
 * Each step is a live control that behaves the way the real one does. The four
 * chosen are the four that catch people out: charging is compulsory, firing
 * destroys the card, both plans resolve together, and a sink tells you a
 * length and never a name.
 */
export function HowToPlay(): ReactElement {
  const go = useStore((s) => s.go);
  const [step, setStep] = useState(0);
  const steps = [Charging, Firing, Simultaneous, Sinks];
  const Step = steps[step];

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>How to play</h2>
        <span className="pill">
          {step + 1} of {steps.length}
        </span>
      </div>
      <Step />
      <div className="spacer" />
      <div className="row">
        <button
          className="btn ghost"
          style={{ flex: 1 }}
          onClick={() => (step === 0 ? go('menu') : setStep(step - 1))}
        >
          {step === 0 ? 'back' : 'previous'}
        </button>
        <button
          className="btn go"
          style={{ flex: 2 }}
          onClick={() => (step === steps.length - 1 ? go('menu') : setStep(step + 1))}
        >
          {step === steps.length - 1 ? 'done' : 'next'}
        </button>
      </div>
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
      <div className="row" style={{ gap: 6 }}>
        {['salvo', 'burst', 'mirror'].map((id, i) => (
          <div key={id} style={{ flex: 1 }}>
            <CardArt
              defId={id}
              charges={charges[i]}
              onClick={() => setCharges(charges.map((c, j) => (j === i ? c + 1 : c)))}
            />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12 }}>
        {placed === 0
          ? 'Tap a card to charge it.'
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
      <div className="row" style={{ gap: 6 }}>
        <div style={{ flex: 1 }}>
          {gone ? (
            <div
              className="card-surface"
              style={{ aspectRatio: '2 / 3', display: 'grid', placeItems: 'center', opacity: 0.4 }}
            >
              <span style={{ fontSize: 11 }}>destroyed</span>
            </div>
          ) : (
            <CardArt defId="salvo" charges={5} onClick={() => setGone(true)} />
          )}
        </div>
        <p style={{ flex: 2, fontSize: 12 }}>
          {gone
            ? 'Five charges spent, five cells fired at, and Salvo is out of the match.'
            : 'Tap to fire it at five charges.'}
        </p>
      </div>
      <p style={{ fontSize: 12 }}>
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
      <p style={{ fontSize: 12 }}>
        That is why the order matters: interference first, then reads, then attacks together, then
        sinks, then anything a dying ship does on its way down.
      </p>
    </div>
  );
}

function Sinks(): ReactElement {
  const marks: Record<number, 'hit' | 'miss'> = {
    8: 'hit',
    9: 'hit',
    10: 'hit',
    3: 'miss',
    20: 'miss',
  };
  return (
    <div className="col">
      <h3>A sink tells you a length</h3>
      <p>
        When a ship goes down you are told how long it was. Never what it was. Every fleet is one 4,
        one 3 and one 2, so the length tells you which slot died — and their pack of four still has
        three candidates in it.
      </p>
      <Board marks={marks} />
      <p style={{ fontSize: 12 }}>
        Their ships only name themselves by acting. Using an ability flips that ship face up forever
        — but it never says where it is.
      </p>
    </div>
  );
}
