/**
 * Ops CLI: release a single user's purchase back to stock (customer-service
 * correction - wrong email, duplicate account, chargeback) without resetting
 * the whole sale, which would wipe every other buyer too.
 *
 * Hits `POST /api/sale/revoke`, which only exists when the backend was
 * started with `ENABLE_ADMIN_API=1`. Unlike the sale window, the buyer set
 * lives in the shared store (Redis in production), so this is globally
 * consistent across every API node - no multi-node caveat here.
 *
 * Usage:
 *   npm run sale:revoke --workspace @flash-sale/backend -- alice@example.com
 *   BASE_URL=https://sale.example.com npm run sale:revoke --workspace @flash-sale/backend -- alice@example.com
 */
export {}; // force module scope so this file doesn't collide with other CLI scripts

// 127.0.0.1, not "localhost": Node's fetch can resolve "localhost" to the
// IPv6 loopback (::1) first, which gets ECONNREFUSED against a server bound
// to 0.0.0.0 (IPv4-only) - same reason run-stress.ts avoids it.
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const userId = process.argv[2];

async function main(): Promise<void> {
  if (!userId) {
    console.error('Usage: npm run sale:revoke --workspace @flash-sale/backend -- <userId>');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/sale/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string };

  // A disabled admin API and an unknown-user revoke both return 404, but only
  // the former has no recognizable body shape - distinguish them so the
  // "turn on the flag" message doesn't get shown for a perfectly normal
  // "this user never bought" case.
  if (res.status === 404 && body.status !== 'not_found') {
    console.error(
      `Admin API is disabled at ${BASE_URL}. Start the backend with ENABLE_ADMIN_API=1 to use this command.`,
    );
    process.exit(1);
  }

  if (body.status === 'not_found') {
    console.error(`No purchase found for userId "${userId}" - nothing to revoke.`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Failed to revoke purchase: HTTP ${res.status}`, body);
    process.exit(1);
  }

  console.log(`Revoked purchase for "${userId}". Unit returned to stock.`);
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('Error revoking purchase:', err);
  process.exit(1);
});
