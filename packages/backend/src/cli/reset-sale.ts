/**
 * Ops CLI: back up the buyer set to a local CSV, then reset the sale.
 *
 * `POST /api/sale/reset` on its own wipes every recorded buyer with zero
 * snapshot - fine for local iteration, a real footgun for anyone using it as
 * an ops action against a live Redis-backed sale. This wraps it: read the
 * buyer set directly from Redis (same `{prefix}:buyers` key the "Exporting
 * buyer data" README section documents), write it to a timestamped CSV on
 * the machine running this script, THEN call reset.
 *
 * Deliberately a client-side script, not a server-side feature: the API tier
 * is stateless by design (see docs/DEPLOYMENT.md), so writing a "backup" file
 * from inside the disposable API process would just vanish on the next
 * deploy and give false confidence. Doing it here, before the HTTP call,
 * keeps the backup on durable ground (the operator's machine) without
 * touching that design.
 *
 * Usage:
 *   npm run sale:reset --workspace @flash-sale/backend
 *   npm run sale:reset --workspace @flash-sale/backend -- 60000   # custom durationMs
 *   REDIS_URL=redis://prod-redis:6379 BASE_URL=https://sale.example.com \
 *     npm run sale:reset --workspace @flash-sale/backend
 *
 * Caveats (both worth naming out loud, not hiding):
 *   1. Small race window between the backup snapshot and the reset call - a
 *      purchase landing in between is wiped without being in the CSV. This
 *      script is an ops safety net for an already-dev/demo-only endpoint, not
 *      a transactional guarantee.
 *   2. Only backs up anything when the backend runs with STORE=redis. With
 *      STORE=memory the buyer set lives inside the Node process and isn't
 *      reachable from here - this script says so and still proceeds with the
 *      reset rather than blocking on a copy it structurally cannot make.
 */
export {}; // force module scope so this file doesn't collide with other CLI scripts

import { Redis } from 'ioredis';
import { writeFileSync } from 'node:fs';

// 127.0.0.1, not "localhost": Node's fetch can resolve "localhost" to the
// IPv6 loopback (::1) first, which gets ECONNREFUSED against a server bound
// to 0.0.0.0 (IPv4-only) - same reason run-stress.ts avoids it.
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'flashsale';
const durationArg = process.argv[2];
const durationMs = durationArg !== undefined ? Number.parseInt(durationArg, 10) : undefined;

async function backupBuyers(): Promise<void> {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
  try {
    await redis.connect();
    const buyers = await redis.smembers(`${KEY_PREFIX}:buyers`);
    if (buyers.length === 0) {
      console.log(
        `No buyers found at ${REDIS_URL} key "${KEY_PREFIX}:buyers" - either nobody has bought yet, or ` +
          'the backend is running with STORE=memory, which this script cannot reach at all. Proceeding with reset.',
      );
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `buyers-backup-${timestamp}.csv`;
    writeFileSync(filename, ['userId', ...buyers].join('\n') + '\n');
    console.log(`Backed up ${buyers.length} buyer(s) to ./${filename}`);
  } catch (err) {
    console.warn(
      `Could not back up buyers from ${REDIS_URL} (${(err as Error).message}). ` +
        'Proceeding with reset unbacked-up - if that is not what you want, Ctrl+C now.',
    );
  } finally {
    redis.disconnect();
  }
}

async function resetSale(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sale/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(durationMs !== undefined ? { durationMs } : {}),
  });

  if (res.status === 404) {
    console.error(
      `Admin API is disabled at ${BASE_URL}. Start the backend with ENABLE_ADMIN_API=1 to use this command.`,
    );
    process.exit(1);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Failed to reset sale: HTTP ${res.status}`, body);
    process.exit(1);
  }

  console.log('Sale reset.');
  console.log(JSON.stringify(body, null, 2));
}

async function main(): Promise<void> {
  await backupBuyers();
  await resetSale();
}

main().catch((err) => {
  console.error('Error resetting sale:', err);
  process.exit(1);
});
