import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { FlashSaleService } from '../src/service/FlashSaleService.js';
import { buildServer } from '../src/server.js';

const START = Date.parse('2026-01-01T10:00:00.000Z');
const END = Date.parse('2026-01-01T11:00:00.000Z');

/** Build a server whose sale is mid-window (active) with the given stock. */
async function activeApp(totalStock = 3): Promise<FastifyInstance> {
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
  return buildServer({ service });
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
});
