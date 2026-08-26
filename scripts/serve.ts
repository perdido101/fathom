import { NetServer } from '../src/server/net/netServer';

/**
 * The staging entrypoint: one process, one port, structured logs on stdout.
 *
 *   PORT=8787 npm run serve
 *
 * State is in memory — matches do not survive a restart, and the docs
 * (docs/DEPLOY.md) spell out what that means for money: escrowed stakes are
 * recoverable through the on-chain reclaim paths regardless of what happens
 * to this process. Every event lands on stdout as one JSON line, keyed by
 * match id and timestamp — enough to reconstruct any dispute.
 */
const port = Number(process.env.PORT ?? 8787);

const server = new NetServer({
  port,
  log: (record) => console.log(JSON.stringify(record)),
  casualBotAfterMs: Number(process.env.SA_CASUAL_BOT_MS ?? 6_000),
  queueTimeoutMs: Number(process.env.SA_QUEUE_TIMEOUT_MS ?? 120_000),
});

console.log(
  JSON.stringify({
    at: Date.now(),
    type: 'listening',
    port: server.address(),
    health: `http://0.0.0.0:${server.address()}/healthz`,
  }),
);

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
