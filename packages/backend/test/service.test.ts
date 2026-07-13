import { describe, it, expect } from 'vitest';
import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { FlashSaleService, InvalidUserIdError } from '../src/service/FlashSaleService.js';

const START = Date.parse('2026-01-01T10:00:00.000Z');
const END = Date.parse('2026-01-01T11:00:00.000Z');

function makeService(nowRef: { value: number }, totalStock = 10) {
  const store = new InMemoryInventoryStore();
  const service = new FlashSaleService({
    store,
    product: { name: 'Test Product', tagline: '', price: '$1', imageUrl: '/product.jpg' },
    totalStock,
    saleStart: START,
    saleEnd: END,
    now: () => nowRef.value,
  });
  return { store, service };
}

describe('FlashSaleService sale window', () => {
  it('reports upcoming before the sale starts and rejects purchases', async () => {
    const now = { value: START - 1000 };
    const { service } = makeService(now);
    await service.init();

    const status = await service.getStatus();
    expect(status.status).toBe('upcoming');

    const result = await service.attemptPurchase('alice');
    expect(result).toEqual({ status: 'not_started', secured: false });
  });

  it('reports active during the window and allows purchases', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    expect((await service.getStatus()).status).toBe('active');
    expect(await service.attemptPurchase('alice')).toEqual({ status: 'success', secured: true });
  });

  it('reports ended after the window and rejects purchases', async () => {
    const now = { value: END };
    const { service } = makeService(now);
    await service.init();

    expect((await service.getStatus()).status).toBe('ended');
    expect(await service.attemptPurchase('alice')).toEqual({ status: 'ended', secured: false });
  });

  it('a user who bought during the sale still reads as secured', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    await service.attemptPurchase('alice');
    expect(await service.hasPurchased('alice')).toBe(true);

    // Second attempt returns already_purchased, still secured.
    expect(await service.attemptPurchase('alice')).toEqual({
      status: 'already_purchased',
      secured: true,
    });
  });

  it('surfaces sold_out when stock runs out mid-sale', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now, 1);
    await service.init();

    expect(await service.attemptPurchase('a')).toEqual({ status: 'success', secured: true });
    expect(await service.attemptPurchase('b')).toEqual({ status: 'sold_out', secured: false });
  });

  it('rejects empty / whitespace user ids', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    await expect(service.attemptPurchase('   ')).rejects.toBeInstanceOf(InvalidUserIdError);
    await expect(service.hasPurchased('')).rejects.toBeInstanceOf(InvalidUserIdError);
  });

  it('trims user ids so " alice " and "alice" are the same person', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    expect(await service.attemptPurchase(' alice ')).toEqual({ status: 'success', secured: true });
    expect(await service.attemptPurchase('alice')).toEqual({
      status: 'already_purchased',
      secured: true,
    });
  });
});
