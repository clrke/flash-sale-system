/**
 * Standalone stress harness.
 *
 * Boots a REAL HTTP server (in-memory store by default, or Redis via STORE=redis)
 * and fires a large number of genuinely concurrent HTTP purchase requests at it
 * over the loopback network, then verifies the two invariants:
 *
 *   1. successful_purchases === stock   (no overselling)
 *   2. each user secures at most one unit (no duplicates)
 *
 * Usage:
 *   npm run stress
 *   USERS=20000 STOCK=500 CONCURRENCY=500 npm run stress
 *   STORE=redis REDIS_URL=redis://localhost:6379 npm run stress
 *
 * Exit code is 0 only if both invariants hold.
 */
import { createStore } from '../config.js';
import { FlashSaleService } from '../service/FlashSaleService.js';
import { buildServer } from '../server.js';
import type { AppConfig } from '../config.js';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const USERS = intEnv('USERS', 10_000);
const STOCK = intEnv('STOCK', 200);
// Duplicate pressure: this fraction of requests reuse an already-seen userId,
// exercising the one-per-user guarantee under load, not just no-oversell.
const DUPLICATE_RATIO = Math.min(Math.max(Number(process.env.DUPLICATE_RATIO ?? '0.1'), 0), 0.9);
// Max in-flight requests at once (a real client can't open unlimited sockets).
const CONCURRENCY = intEnv('CONCURRENCY', 500);

async function pooledMap<T>(count: number, limit: number, task: (i: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= count) return;
      results[i] = await task(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker));
  return results;
}

async function main(): Promise<void> {
  const storeKind = (process.env.STORE ?? 'memory').toLowerCase() === 'redis' ? 'redis' : 'memory';
  const config: AppConfig = {
    port: 0, // ephemeral port
    host: '127.0.0.1',
    totalStock: STOCK,
    saleStart: Date.now() - 1000,
    saleEnd: Date.now() + 60 * 60 * 1000,
    storeKind,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  };

  const store = createStore(config);
  const service = new FlashSaleService({
    store,
    totalStock: config.totalStock,
    saleStart: config.saleStart,
    saleEnd: config.saleEnd,
  });
  await service.init();

  const app = buildServer({ service });
  await app.listen({ port: config.port, host: config.host });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('failed to bind port');
  const base = `http://127.0.0.1:${address.port}`;

  const distinctUsers = Math.max(1, Math.round(USERS * (1 - DUPLICATE_RATIO)));

  console.log('--- Flash Sale Stress Test ---');
  console.log(
    JSON.stringify(
      { store: storeKind, stock: STOCK, requests: USERS, distinctUsers, concurrency: CONCURRENCY },
      null,
      2,
    ),
  );

  const tally: Record<string, number> = {};
  const start = Date.now();

  await pooledMap(USERS, CONCURRENCY, async (i) => {
    // Map request i to a user id: first `distinctUsers` are unique, the rest
    // wrap around to create duplicate buyers hammering concurrently.
    const userId = `user-${i % distinctUsers}`;
    const res = await fetch(`${base}/api/sale/purchase`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const body = (await res.json()) as { status: string };
    tally[body.status] = (tally[body.status] ?? 0) + 1;
  });

  const elapsedMs = Date.now() - start;

  const statusRes = await fetch(`${base}/api/sale/status`);
  const status = (await statusRes.json()) as { soldCount: number; remainingStock: number };

  const successes = tally.success ?? 0;

  console.log('\n--- Results ---');
  console.log(JSON.stringify(tally, null, 2));
  console.log(
    JSON.stringify(
      {
        elapsedMs,
        throughputReqPerSec: Math.round((USERS / elapsedMs) * 1000),
        soldCount: status.soldCount,
        remainingStock: status.remainingStock,
      },
      null,
      2,
    ),
  );

  // Invariant checks.
  const errors: string[] = [];
  if (successes !== STOCK) errors.push(`expected ${STOCK} successes, got ${successes}`);
  if (status.soldCount !== STOCK) errors.push(`expected soldCount ${STOCK}, got ${status.soldCount}`);
  if (status.remainingStock !== 0) errors.push(`expected remainingStock 0, got ${status.remainingStock}`);

  await app.close();
  await store.close();

  if (errors.length > 0) {
    console.error('\nFAILED invariants:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  console.log(`\nPASS: exactly ${STOCK} units sold, no overselling, one unit per user.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Stress harness error:', err);
  process.exit(1);
});
