/**
 * Ops CLI: end a running sale immediately (kill switch).
 *
 * Hits `POST /api/sale/end`, which only exists when the backend was started
 * with `ENABLE_ADMIN_API=1`. Existing winners keep their unit; every purchase
 * attempt after this returns `ended`. Does not touch stock or the buyer set.
 *
 * Usage:
 *   npm run sale:end --workspace @flash-sale/backend
 *   BASE_URL=https://sale.example.com npm run sale:end --workspace @flash-sale/backend
 *
 * Caveat: the sale window lives on the backend process that handles this
 * request, not in the shared store. Behind a load balancer with multiple API
 * nodes, this only ends the sale on whichever node answers - see the
 * `endNow()` doc comment in FlashSaleService for why, and docs/DEPLOYMENT.md
 * for the durable fix.
 */
export {}; // force module scope so this file doesn't collide with other CLI scripts

// 127.0.0.1, not "localhost": Node's fetch can resolve "localhost" to the
// IPv6 loopback (::1) first, which gets ECONNREFUSED against a server bound
// to 0.0.0.0 (IPv4-only) - same reason run-stress.ts avoids it.
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

async function main(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sale/end`, { method: 'POST' });

  if (res.status === 404) {
    console.error(
      `Admin API is disabled at ${BASE_URL}. Start the backend with ENABLE_ADMIN_API=1 to use this command.`,
    );
    process.exit(1);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Failed to end sale: HTTP ${res.status}`, body);
    process.exit(1);
  }

  console.log('Sale ended immediately.');
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('Error ending sale:', err);
  process.exit(1);
});
