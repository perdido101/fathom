import type { Placement } from '../../engine/board';
import type { Outcome, Plan, PlayerId, ResolveEvent } from '../../engine/types';
import type { ClientView } from '../../engine/view';
import type { Mode, Stake } from '../../state/profile';
import type { Bracket } from '../../tournament/bracket';

/**
 * The wire protocol, versioned from day one.
 *
 * Every message is one JSON object with a `t` discriminant. Match-scoped
 * server messages carry the match id, the round, and a per-room monotonic
 * `seq` — a client that receives seq 41 after 43 knows to discard it, and a
 * dispute can be reconstructed by ordering the log by seq.
 *
 * The client is a renderer: nothing a client sends can assert state, only
 * intent, and everything the server sends is a `ClientView` projection or an
 * event list derived from one. The commit–reveal split is explicit on the
 * wire: a plan travels as its hash first, and the plan itself is accepted
 * only after both hashes are in.
 */

export const PROTOCOL_VERSION = 1;

// --- client → server -------------------------------------------------------

export type ClientMessage =
  | {
      t: 'hello';
      v: number;
      name: string;
      sessionPublicKey: string;
      /** Signature over { challenge } with the session key. */
      signature: string;
    }
  | { t: 'queueEnter'; mode: Mode; stake: Stake; rating: number; provisional: boolean }
  | { t: 'queueExit' }
  | { t: 'rejoin'; matchId: string; seat: PlayerId; token: string }
  | { t: 'pickShip'; matchId: string; defId: string }
  | { t: 'pickCard'; matchId: string; defId: string }
  | { t: 'deploy'; matchId: string; placements: Placement[]; nonce: string }
  | { t: 'planCommit'; matchId: string; round: number; hash: string; signature: string | null }
  | { t: 'planReveal'; matchId: string; round: number; plan: Plan; nonce: string }
  | { t: 'leave'; matchId: string }
  | { t: 'ping'; at?: number };

// --- server → client -------------------------------------------------------

export interface MatchScope {
  matchId: string;
  round: number;
  seq: number;
}

export type ServerMessage =
  | { t: 'challenge'; v: number; nonce: string }
  | { t: 'welcome'; v: number; clientId: string }
  | { t: 'queued'; mode: Mode; stake: Stake; waiting: number }
  | { t: 'queueTimeout'; mode: Mode; stake: Stake; reason: string }
  | {
      t: 'matchFound';
      matchId: string;
      seat: PlayerId;
      token: string;
      opponent: string;
      mode: Mode;
      stake: Stake;
      /** True only ever in casual — a staked player never silently faces a bot. */
      vsBot: boolean;
    }
  | ({
      t: 'state';
      phase: string;
      view: ClientView;
      /** Server-authoritative deadline for the current phase, epoch ms. */
      deadlineAt: number | null;
      opponentConnected: boolean;
      /** Beats from the last resolved round, for a client that missed them. */
      events: ResolveEvent[];
    } & MatchScope)
  | ({ t: 'update'; view: ClientView; events: ResolveEvent[] } & MatchScope)
  | ({ t: 'revealOpen'; deadlineAt: number } & MatchScope)
  | ({ t: 'roundReport'; view: ClientView; events: ResolveEvent[] } & MatchScope)
  | ({ t: 'result'; outcome: Outcome | null; view: ClientView } & MatchScope)
  | ({ t: 'oppStatus'; connected: boolean } & MatchScope)
  | {
      t: 'bracketState';
      seq: number;
      stake: Stake;
      bracket: Bracket;
      yourSeat: number;
      /** Match the client should join next, when it is their turn. */
      play: { matchId: string; seat: PlayerId; token: string; opponent: string } | null;
      place: 'champion' | 'runnerUp' | 'semiLoser' | 'out' | null;
    }
  | { t: 'error'; code: string; message: string; matchId?: string }
  | { t: 'pong'; at?: number };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as ClientMessage;
    if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') return null;
    return msg;
  } catch {
    return null;
  }
}
