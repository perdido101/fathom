import { describe, expect, it } from 'vitest';
import { MatchServer, type SeatCredentials } from './matchServer';
import { RateLimiter } from './rateLimit';
import { commitPlan } from '../engine/match';
import { emptyPlan, type Plan } from '../engine/types';
import { issueSessionKey, signPlan } from '../chain/sessionKey';
import { stableStringify } from '../engine/sha256';
import type { Placement } from '../engine/board';
import { SHIPS } from '../engine/ships';
import { cellAt } from '../engine/types';

/** A clock the tests drive by hand. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function rows(ids: string[], startRow: number): Placement[] {
  return ids.map((defId, i) => ({
    defId,
    cells: Array.from({ length: SHIPS[defId].length }, (_, k) => cellAt(k, startRow + i)),
  }));
}

/** A server with a match already at the top of round 1. */
function battleReady(sessionKeys: [string | null, string | null] = [null, null]) {
  const c = clock();
  const server = new MatchServer({ now: c.now });
  const { credentials } = server.createMatchFor(
    ['alice', 'bob'],
    'server-seed-0123456789abcdef',
    sessionKeys,
  );
  const [a, b] = credentials;

  for (let pack = 0; pack < 3; pack++) {
    const packs = server.view(a)!.shipDraft.packs[pack];
    server.submit(a, { kind: 'pickShip', defId: packs[0] });
    server.submit(b, { kind: 'pickShip', defId: packs[1] });
  }
  for (let pack = 0; pack < 3; pack++) {
    const packs = server.view(a)!.cardDraft.packs[pack];
    server.submit(a, { kind: 'pickCard', defId: packs[0] });
    server.submit(b, { kind: 'pickCard', defId: packs[1] });
  }
  server.submit(a, {
    kind: 'deploy',
    placements: rows(server.view(a)!.me.draftedShips, 0),
    nonce: 'na',
  });
  server.submit(b, {
    kind: 'deploy',
    placements: rows(server.view(b)!.me.draftedShips, 3),
    nonce: 'nb',
  });
  return { server, a, b, c };
}

function idlePlan(server: MatchServer, creds: SeatCredentials): Plan {
  const first = server.view(creds)!.me.hand[0];
  return { ...emptyPlan(), chargeTo: first?.uid ?? null, bonusTo: first?.uid ?? null, basic: 0 };
}

describe('server authority', () => {
  it('never hands the client anything but a view', () => {
    const { server, a, b } = battleReady();
    const view = server.view(a)!;
    const json = stableStringify(view);
    // The opponent's fleet is on the server, and only there.
    const foeState = server.transcriptInputs(a.matchId)!.state.players[1];
    for (const ship of foeState.ships) {
      expect(json).not.toContain(stableStringify(ship.cells));
    }
    expect(server.view(b)).not.toBeNull();
  });

  it('refuses a command from a seat whose token does not fit', () => {
    const { server, a } = battleReady();
    const forged: SeatCredentials = { ...a, seat: 1 };
    const res = server.submit(forged, {
      kind: 'plan',
      committed: commitPlan(emptyPlan(), 'x', 's'),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/token does not fit/);
    expect(res.view).toBeNull();
  });

  it('refuses a plan naming a card the player does not hold', () => {
    const { server, a } = battleReady();
    const plan: Plan = { ...idlePlan(server, a), chargeTo: 999_999 };
    const res = server.submit(a, { kind: 'plan', committed: commitPlan(plan, 'x', 's') });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not in hand/);
  });

  it('refuses a plan whose commitment does not match it', () => {
    const { server, a } = battleReady();
    const good = commitPlan(idlePlan(server, a), 'x', 's');
    const tampered = { ...good, plan: { ...good.plan, basic: 35 } };
    const res = server.submit(a, { kind: 'plan', committed: tampered });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/does not match its commitment/);
  });

  it('holds the first plan until the second arrives, revealing nothing meanwhile', () => {
    const { server, a, b } = battleReady();
    const first = server.submit(a, {
      kind: 'plan',
      committed: commitPlan(idlePlan(server, a), 'x', 's'),
    });
    expect(first.ok).toBe(true);
    expect(first.events).toHaveLength(0);
    // Nothing about the opponent's plan is visible to either side yet.
    expect(server.view(b)!.round).toBe(1);
    const second = server.submit(b, {
      kind: 'plan',
      committed: commitPlan(idlePlan(server, b), 'y', 's'),
    });
    expect(second.events.length).toBeGreaterThan(0);
    expect(server.view(a)!.round).toBe(2);
  });

  it('refuses a second plan in the same round', () => {
    const { server, a } = battleReady();
    server.submit(a, { kind: 'plan', committed: commitPlan(idlePlan(server, a), 'x', 's') });
    const again = server.submit(a, {
      kind: 'plan',
      committed: commitPlan(idlePlan(server, a), 'z', 's'),
    });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already submitted/);
  });

  it('refuses to let a fleet be redeployed', () => {
    // Deploy only one side, so the match is still in the deployment phase and
    // the guard under test is the one that actually fires.
    const c = clock();
    const server = new MatchServer({ now: c.now });
    const { credentials } = server.createMatchFor(['alice', 'bob'], 'redeploy-0123456789abcdef');
    const [a, b] = credentials;
    for (let pack = 0; pack < 3; pack++) {
      const packs = server.view(a)!.shipDraft.packs[pack];
      server.submit(a, { kind: 'pickShip', defId: packs[0] });
      server.submit(b, { kind: 'pickShip', defId: packs[1] });
    }
    for (let pack = 0; pack < 3; pack++) {
      const packs = server.view(a)!.cardDraft.packs[pack];
      server.submit(a, { kind: 'pickCard', defId: packs[0] });
      server.submit(b, { kind: 'pickCard', defId: packs[1] });
    }
    const ships = server.view(a)!.me.draftedShips;
    expect(server.submit(a, { kind: 'deploy', placements: rows(ships, 0), nonce: 'na' }).ok).toBe(
      true,
    );
    const again = server.submit(a, { kind: 'deploy', placements: rows(ships, 2), nonce: 'again' });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already committed/);
  });

  it('refuses a second pick from the same draft pack', () => {
    const c = clock();
    const server = new MatchServer({ now: c.now });
    const { credentials } = server.createMatchFor(['alice', 'bob'], 'draft-seed-0123456789abcdef');
    const [a] = credentials;
    const pack = server.view(a)!.shipDraft.packs[0];
    expect(server.submit(a, { kind: 'pickShip', defId: pack[0] }).ok).toBe(true);
    const again = server.submit(a, { kind: 'pickShip', defId: pack[1] });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already picked/);
  });
});

describe('session keys at the server', () => {
  it('rejects a plan not signed by the published session key', () => {
    const mine = issueSessionKey(0);
    const impostor = issueSessionKey(1);
    const { server, a } = battleReady([mine.publicKeyHex, null]);
    const plan = idlePlan(server, a);
    const wrong = commitPlan(plan, 'x', signPlan(impostor, plan, 'x'));
    const res = server.submit(a, { kind: 'plan', committed: wrong });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/signature does not match/);

    const right = commitPlan(plan, 'x', signPlan(mine, plan, 'x'));
    expect(server.submit(a, { kind: 'plan', committed: right }).ok).toBe(true);
  });

  it('rejects an unsigned plan when a session key was published', () => {
    const mine = issueSessionKey(0);
    const { server, a } = battleReady([mine.publicKeyHex, null]);
    const res = server.submit(a, {
      kind: 'plan',
      committed: commitPlan(idlePlan(server, a), 'x', null),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unsigned/);
  });
});

describe('reconnection', () => {
  it('lets a player rejoin inside the grace period and hands back what they missed', () => {
    const { server, a, b, c } = battleReady();
    server.submit(a, { kind: 'plan', committed: commitPlan(idlePlan(server, a), 'x', 's') });
    server.submit(b, { kind: 'plan', committed: commitPlan(idlePlan(server, b), 'y', 's') });

    server.submit(a, { kind: 'disconnect' });
    c.advance(20_000); // well inside the 60s grace
    const back = server.submit(a, { kind: 'reconnect' });
    expect(back.ok).toBe(true);
    expect(back.view!.round).toBe(2);
    // The last round's beats come back, so a refresh mid-animation is not a
    // board that silently jumped.
    expect(back.events.length).toBeGreaterThan(0);
  });

  it('refuses a rejoin after the grace period', () => {
    const { server, a, c } = battleReady();
    server.submit(a, { kind: 'disconnect' });
    c.advance(61_000);
    const back = server.submit(a, { kind: 'reconnect' });
    expect(back.ok).toBe(false);
    expect(back.error).toMatch(/grace period/);
  });

  it('forfeits a seat that never comes back', () => {
    const { server, a, c } = battleReady();
    server.submit(a, { kind: 'disconnect' });
    expect(server.sweep()).toHaveLength(0);
    c.advance(61_000);
    const swept = server.sweep();
    expect(swept).toHaveLength(1);
    expect(swept[0].forfeited).toBe(0);
    expect(server.view(a)!.outcome).toEqual({ kind: 'win', winner: 1, reason: 'disconnect' });
  });
});

describe('rate limiting', () => {
  it('stops one identity opening matches without end', () => {
    const c = clock();
    const server = new MatchServer({ now: c.now, createsPerMinute: 3 });
    for (let i = 0; i < 3; i++) {
      expect(() =>
        server.createMatchFor(['spammer', 'victim'], `seed-${i}-0123456789abcdef`),
      ).not.toThrow();
    }
    expect(() => server.createMatchFor(['spammer', 'victim'], 'seed-x-0123456789abcdef')).toThrow(
      /rate limit/,
    );
  });

  it('refills continuously rather than resetting on a boundary', () => {
    const c = clock();
    const limiter = new RateLimiter(4, 60_000, c.now);
    for (let i = 0; i < 4; i++) expect(limiter.take('someone')).toBe(true);
    expect(limiter.take('someone')).toBe(false);
    c.advance(15_000); // a quarter of the window buys back one token
    expect(limiter.take('someone')).toBe(true);
    expect(limiter.take('someone')).toBe(false);
  });

  it('limits queue joins separately from match creation', () => {
    const c = clock();
    const server = new MatchServer({ now: c.now, joinsPerMinute: 2 });
    expect(server.joinQueue('alice')).toBe(true);
    expect(server.joinQueue('alice')).toBe(true);
    expect(server.joinQueue('alice')).toBe(false);
    expect(server.joinQueue('bob')).toBe(true);
  });
});

describe('the dispute log', () => {
  it('records what was accepted and what was refused, without leaking plans', () => {
    const { server, a, b } = battleReady();
    const plan = idlePlan(server, a);
    server.submit(a, { kind: 'plan', committed: commitPlan(plan, 'nonce-a', 's') });
    server.submit(a, { kind: 'plan', committed: commitPlan(plan, 'nonce-a', 's') }); // refused
    server.submit(b, { kind: 'plan', committed: commitPlan(idlePlan(server, b), 'nonce-b', 's') });

    const log = server.logOf(a.matchId);
    const kinds = log.map((r) => r.t);
    expect(kinds).toContain('created');
    expect(kinds).toContain('deployed');
    expect(kinds).toContain('planned');
    expect(kinds).toContain('rejected');
    expect(kinds).toContain('resolved');

    // A live plan must never appear in a log that operations can read.
    const json = stableStringify(log);
    expect(json).not.toContain('chargeTo');
    expect(json).not.toContain('bonusTo');
  });

  it('timestamps every entry from the injected clock', () => {
    const { server, a, c } = battleReady();
    c.advance(5_000);
    server.submit(a, { kind: 'disconnect' });
    const last = server.logOf(a.matchId).at(-1)!;
    expect(last.t).toBe('disconnected');
    expect(last.at).toBe(c.now());
  });
});

describe('timeouts', () => {
  it('substitutes a plan for a seat that let the clock run out', () => {
    const { server, a, b } = battleReady();
    server.submit(a, { kind: 'plan', committed: commitPlan(idlePlan(server, a), 'x', 's') });
    const res = server.submit(b, { kind: 'timeout' });
    expect(res.ok).toBe(true);
    expect(server.view(b)!.me.timerStrikes).toBe(1);
    expect(server.view(a)!.round).toBe(2);
  });

  it('ends the match on the third strike', () => {
    const { server, a, b } = battleReady();
    for (let i = 0; i < 3; i++) {
      const view = server.view(a)!;
      if (view.phase !== 'battle') break;
      server.submit(a, { kind: 'plan', committed: commitPlan(idlePlan(server, a), `x${i}`, 's') });
      server.submit(b, { kind: 'timeout' });
    }
    expect(server.view(a)!.outcome).toEqual({
      kind: 'win',
      winner: 0,
      reason: 'timeout-strikes',
    });
  });
});
