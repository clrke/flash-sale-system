import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { FlashSaleService } from '../src/service/FlashSaleService.js';
import { buildServer } from '../src/server.js';

const START = Date.parse('2026-01-01T10:00:00.000Z');
const END = Date.parse('2026-01-01T11:00:00.000Z');

/** Build a server whose sale is mid-window (active) with the given stock. */
async function activeApp(totalStock = 3, opts: { enableAdminApi?: boolean } = {}): Promise<FastifyInstance> {
  const store = new InMemoryInventoryStore();
  const service = new FlashSaleService({
    store,
    product: { name: 'Test Product', tagline: '', price: '$1', imageUrl: '/product.jpg' },
    totalStock,
    saleStart: START,
    saleEnd: END,
    now: () => START + 60_000,
  });
  await service.init();
  return buildServer({ service, enableAdminApi: opts.enableAdminApi });
}

describe('HTTP API', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('GET /api/sale/status returns an active snapshot', async () => {
    app = await activeApp(3);
    const res = await app.inject({ method: 'GET', url: '/api/sale/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('active');
    expect(body.totalStock).toBe(3);
    expect(body.remainingStock).toBe(3);
    expect(body.soldCount).toBe(0);
    expect(body.product).toEqual({
      name: 'Test Product',
      tagline: '',
      price: '$1',
      imageUrl: '/product.jpg',
    });
  });

  it('POST /api/sale/purchase succeeds, then reports already_purchased', async () => {
    app = await activeApp(3);

    const first = await app.inject({
      method: 'POST',
      url: '/api/sale/purchase',
      payload: { userId: 'alice' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ status: 'success', secured: true });

    const second = await app.inject({
      method: 'POST',
      url: '/api/sale/purchase',
      payload: { userId: 'alice' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'already_purchased', secured: true });
  });

  it('POST /api/sale/purchase returns 409 sold_out when stock is gone', async () => {
    app = await activeApp(1);
    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'a' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/sale/purchase',
      payload: { userId: 'b' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ status: 'sold_out', secured: false });
  });

  it('POST /api/sale/purchase returns 400 for a missing userId', async () => {
    app = await activeApp(3);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sale/purchase',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().status).toBe('invalid_user');
  });

  it('GET /api/sale/secured reflects purchase state', async () => {
    app = await activeApp(3);

    const before = await app.inject({ method: 'GET', url: '/api/sale/secured?userId=alice' });
    expect(before.json()).toEqual({ userId: 'alice', secured: false });

    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'alice' } });

    const after = await app.inject({ method: 'GET', url: '/api/sale/secured?userId=alice' });
    expect(after.json()).toEqual({ userId: 'alice', secured: true });
  });

  it('GET /api/sale/secured returns 400 without a userId', async () => {
    app = await activeApp(3);
    const res = await app.inject({ method: 'GET', url: '/api/sale/secured' });
    expect(res.statusCode).toBe(400);
  });

  it('serves many concurrent purchases without overselling', async () => {
    app = await activeApp(50);
    const responses = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/sale/purchase',
          payload: { userId: `user-${i}` },
        }),
      ),
    );
    const successes = responses.filter((r) => r.json().status === 'success').length;
    expect(successes).toBe(50);

    const status = await app.inject({ method: 'GET', url: '/api/sale/status' });
    expect(status.json().remainingStock).toBe(0);
    expect(status.json().soldCount).toBe(50);
  });

  it('POST /api/sale/reset is a 404 by default (not wired unless enabled)', async () => {
    app = await activeApp(3);
    const res = await app.inject({ method: 'POST', url: '/api/sale/reset' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/sale/reset refills stock and restarts the window when enabled', async () => {
    app = await activeApp(2, { enableAdminApi: true });

    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'a' } });
    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'b' } });
    expect((await app.inject({ method: 'GET', url: '/api/sale/status' })).json().remainingStock).toBe(0);

    const res = await app.inject({ method: 'POST', url: '/api/sale/reset', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.remainingStock).toBe(2);
    expect(body.soldCount).toBe(0);
    expect(Date.parse(body.saleEnd) - Date.parse(body.saleStart)).toBe(3 * 60 * 1000);

    const secured = await app.inject({ method: 'GET', url: '/api/sale/secured?userId=a' });
    expect(secured.json()).toEqual({ userId: 'a', secured: false });
  });

  it('POST /api/sale/reset accepts a custom durationMs', async () => {
    app = await activeApp(2, { enableAdminApi: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sale/reset',
      payload: { durationMs: 60_000 },
    });
    const body = res.json();
    expect(Date.parse(body.saleEnd) - Date.parse(body.saleStart)).toBe(60_000);
  });

  it('POST /api/sale/reset returns 400 for an invalid durationMs', async () => {
    app = await activeApp(2, { enableAdminApi: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sale/reset',
      payload: { durationMs: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/sale/end is a 404 by default (not wired unless enabled)', async () => {
    app = await activeApp(3);
    const res = await app.inject({ method: 'POST', url: '/api/sale/end' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/sale/end ends the sale immediately when enabled, without touching stock', async () => {
    app = await activeApp(3, { enableAdminApi: true });
    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'alice' } });

    const res = await app.inject({ method: 'POST', url: '/api/sale/end' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ended');
    expect(body.remainingStock).toBe(2);
    expect(body.soldCount).toBe(1);

    // Ended means ended: even an existing winner's re-check still reads as secured...
    const secured = await app.inject({ method: 'GET', url: '/api/sale/secured?userId=alice' });
    expect(secured.json()).toEqual({ userId: 'alice', secured: true });

    // ...but nobody new can buy anymore.
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/sale/purchase',
      payload: { userId: 'bob' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ status: 'ended', secured: false });
  });

  it('POST /api/sale/revoke is a 404 by default (not wired unless enabled)', async () => {
    app = await activeApp(3);
    const res = await app.inject({ method: 'POST', url: '/api/sale/revoke', payload: { userId: 'alice' } });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/sale/revoke releases a unit back to stock and lets the user buy again', async () => {
    app = await activeApp(2, { enableAdminApi: true });
    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'alice' } });
    expect((await app.inject({ method: 'GET', url: '/api/sale/status' })).json().remainingStock).toBe(1);

    const res = await app.inject({
      method: 'POST',
      url: '/api/sale/revoke',
      payload: { userId: 'alice' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'revoked', userId: 'alice' });

    expect((await app.inject({ method: 'GET', url: '/api/sale/status' })).json().remainingStock).toBe(2);
    const secured = await app.inject({ method: 'GET', url: '/api/sale/secured?userId=alice' });
    expect(secured.json()).toEqual({ userId: 'alice', secured: false });

    // Other buyers are untouched by a single-user revoke (unlike reset).
    await app.inject({ method: 'POST', url: '/api/sale/purchase', payload: { userId: 'bob' } });
    const revokeAgain = await app.inject({
      method: 'POST',
      url: '/api/sale/revoke',
      payload: { userId: 'alice' },
    });
    expect(revokeAgain.statusCode).toBe(404);
    expect(revokeAgain.json()).toEqual({ status: 'not_found', userId: 'alice' });
    expect((await app.inject({ method: 'GET', url: '/api/sale/secured?userId=bob' })).json().secured).toBe(true);
  });

  it('POST /api/sale/revoke returns 400 for a missing userId', async () => {
    app = await activeApp(2, { enableAdminApi: true });
    const res = await app.inject({ method: 'POST', url: '/api/sale/revoke', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().status).toBe('invalid_user');
  });
});
