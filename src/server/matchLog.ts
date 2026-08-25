import type { Outcome, PlayerId, ResolveEvent } from '../engine/types';

/**
 * The dispute record.
 *
 * When a player says they were robbed, the useful answer is not "the code is
 * correct" — it is a timestamped list of what the server was asked to do, what
 * it accepted, and what it refused. Every entry here is structured rather than
 * a formatted string, so a dispute can be queried instead of grepped.
 *
 * Note what is *not* recorded: plan contents. The log keeps commitment hashes
 * during play and the transcript carries the plans themselves at the end. A
 * log that held both would be a log that could leak a live match to anyone who
 * could read it.
 */
export type LogRecord =
  | { t: 'created'; at: number; matchId: string; seedCommit: string }
  | { t: 'draft'; at: number; seat: PlayerId; kind: 'ship' | 'card'; defId: string }
  | { t: 'deployed'; at: number; seat: PlayerId; commitment: string }
  | { t: 'planned'; at: number; seat: PlayerId; commitHash: string }
  | { t: 'timedOut'; at: number; seat: PlayerId }
  | { t: 'resolved'; at: number; round: number; beats: number; summary: string }
  | { t: 'rejected'; at: number; seat: PlayerId; reason: string }
  | { t: 'disconnected'; at: number; seat: PlayerId }
  | { t: 'reconnected'; at: number; seat: PlayerId }
  | { t: 'forfeited'; at: number; seat: PlayerId }
  | { t: 'finished'; at: number; outcome: Outcome | null };

export class MatchLog {
  private readonly entries: LogRecord[] = [];

  constructor(
    matchId: string,
    seedCommit: string,
    private readonly now: () => number,
  ) {
    this.entries.push({ t: 'created', at: this.now(), matchId, seedCommit });
  }

  private push(r: LogRecord): void {
    this.entries.push(r);
    // A single match cannot grow without bound; twenty rounds of two players
    // is a few hundred entries at most, and this cap is a backstop against a
    // client that spams rejections rather than a real limit.
    if (this.entries.length > 5000) this.entries.splice(1, 1000);
  }

  draft(seat: PlayerId, kind: 'ship' | 'card', defId: string): void {
    this.push({ t: 'draft', at: this.now(), seat, kind, defId });
  }

  deployed(seat: PlayerId, commitment: string): void {
    this.push({ t: 'deployed', at: this.now(), seat, commitment });
  }

  planned(seat: PlayerId, commitHash: string): void {
    this.push({ t: 'planned', at: this.now(), seat, commitHash });
  }

  timedOut(seat: PlayerId): void {
    this.push({ t: 'timedOut', at: this.now(), seat });
  }

  resolved(round: number, beats: ResolveEvent[]): void {
    const hits = beats.filter((b) => b.t === 'shot' && b.hit).length;
    const sinks = beats.filter((b) => b.t === 'sink').length;
    this.push({
      t: 'resolved',
      at: this.now(),
      round,
      beats: beats.length,
      summary: `${hits} hits, ${sinks} sinks`,
    });
  }

  rejected(seat: PlayerId, reason: string): void {
    this.push({ t: 'rejected', at: this.now(), seat, reason });
  }

  disconnected(seat: PlayerId): void {
    this.push({ t: 'disconnected', at: this.now(), seat });
  }

  reconnected(seat: PlayerId): void {
    this.push({ t: 'reconnected', at: this.now(), seat });
  }

  forfeited(seat: PlayerId): void {
    this.push({ t: 'forfeited', at: this.now(), seat });
  }

  finished(outcome: Outcome | null): void {
    this.push({ t: 'finished', at: this.now(), outcome });
  }

  records(): LogRecord[] {
    return this.entries.slice();
  }

  /** One line per entry, for a human reading a dispute. */
  format(): string {
    return this.entries
      .map((e) => {
        const rest = Object.entries(e)
          .filter(([k]) => k !== 't' && k !== 'at')
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join(' ');
        return `${e.at} ${e.t.padEnd(12)} ${rest}`;
      })
      .join('\n');
  }
}
