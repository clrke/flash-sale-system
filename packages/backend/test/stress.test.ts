import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { FlashSaleService } from '../src/service/FlashSaleService.js';
import { buildServer } from '../src/server.js';

/**
 * Stress test at the HTTP layer. This is the test that actually proves the
 * headline invariant: under a thundering herd of concurrent buyers,
 *   successful_purchases === stock   (exactly, never more)
 * and every user secures at most one unit.
 *
 * It runs through `app.inject`, which exercises the full Fastify request
 * pipeline (routing, body parsing, handler, service, store) for each call, so
 * it is a realistic end-to-end concurrency test without needing a live socket.
 */
describe('stress: no oversell under a concurrent herd', () => {
  let app: FastifyInstance | undefined;
  const START = Date.parse('2026-01-01T10:00:00.000Z');
  const END = Date.parse('2026-01-01T11:00:00.000Z');

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  async function boot(stock: number): Promise<FastifyInstance> {
    const service = new FlashSaleService({
      store: new InMemoryInventoryStore(),
      totalStock: stock,
      saleStart: START,
      saleEnd: END,
      now: () => START + 60_000,
    });
    await service.init();
    return buildServer({ service });
  }

  it('10k unique users vs 200 units -> exactly 200 winners', async () => {
    const STOCK = 200;
    const USERS = 10_000;
    app = await boot(STOCK);

    const responses = await Promise.all(
      Array.from({ length: USERS }, (_, i) =>
        app!.inject({
          method: 'POST',
          url: '/api/sale/purchase',
          payload: { userId: `user-${i}` },
        }),
      ),
    );

    let success = 0;
    let soldOut = 0;
    for (const r of responses) {
      const s = r.json().status;
      if (s === 'success') success += 1;
      else if (s === 'sold_out') soldOut += 1;
    }

    expect(success).toBe(STOCK);
    expect(soldOut).toBe(USERS - STOCK);

    const status = (await app.inject({ method: 'GET', url: '/api/sale/status' })).json();
    expect(status.remainingStock).toBe(0);
    expect(status.soldCount).toBe(STOCK);
  });

  it('duplicate users flooding concurrently still get one unit each', async () => {
    const STOCK = 500;
    // 100 distinct users, each firing 20 concurrent requests = 2000 requests.
    const DISTINCT = 100;
    const PER_USER = 20;
    app = await boot(STOCK);

    const requests: Promise<unknown>[] = [];
    for (let u = 0; u < DISTINCT; u++) {
      for (let k = 0; k < PER_USER; k++) {
        requests.push(
          app.inject({
            method: 'POST',
            url: '/api/sale/purchase',
            payload: { userId: `dupe-${u}` },
          }),
        );
      }
    }
    const responses = (await Promise.all(requests)) as { json(): { status: string } }[];

    let success = 0;
    let already = 0;
    for (const r of responses) {
      const s = r.json().status;
      if (s === 'success') success += 1;
      else if (s === 'already_purchased') already += 1;
    }

    // Each distinct user wins exactly once; every other attempt is a dup.
    expect(success).toBe(DISTINCT);
    expect(already).toBe(DISTINCT * PER_USER - DISTINCT);

    const status = (await app.inject({ method: 'GET', url: '/api/sale/status' })).json();
    expect(status.soldCount).toBe(DISTINCT);
    expect(status.remainingStock).toBe(STOCK - DISTINCT);
  });
});
