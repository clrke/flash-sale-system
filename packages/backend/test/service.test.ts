import { describe, it, expect } from 'vitest';
import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { FlashSaleService, InvalidUserIdError, InvalidResetDurationError } from '../src/service/FlashSaleService.js';

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

  it('reset() restarts the clock and refills stock, clearing prior buyers', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now, 2);
    await service.init();

    await service.attemptPurchase('alice');
    expect(await service.attemptPurchase('bob')).toEqual({ status: 'success', secured: true });
    expect((await service.getStatus()).remainingStock).toBe(0);

    now.value += 1000; // reset() reads the clock at call time
    const status = await service.reset(3 * 60 * 1000);

    expect(status.status).toBe('active');
    expect(status.remainingStock).toBe(2);
    expect(status.soldCount).toBe(0);
    expect(Date.parse(status.saleEnd) - Date.parse(status.saleStart)).toBe(3 * 60 * 1000);
    expect(Date.parse(status.saleStart)).toBe(now.value);

    // Previously secured buyers are forgotten - it's a full reset.
    expect(await service.hasPurchased('alice')).toBe(false);

    // The window moved, so a purchase after reset succeeds fresh.
    expect(await service.attemptPurchase('alice')).toEqual({ status: 'success', secured: true });
  });

  it('reset() rejects a non-positive duration', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    await expect(service.reset(0)).rejects.toBeInstanceOf(InvalidResetDurationError);
    await expect(service.reset(-1000)).rejects.toBeInstanceOf(InvalidResetDurationError);
  });

  it('endNow() ends an active sale immediately without touching stock or buyers', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now, 3);
    await service.init();

    await service.attemptPurchase('alice');
    expect((await service.getStatus()).status).toBe('active');

    const status = await service.endNow();
    expect(status.status).toBe('ended');
    expect(status.remainingStock).toBe(2);
    expect(status.soldCount).toBe(1);

    // Existing winner keeps their unit, but nobody new can buy anymore.
    expect(await service.hasPurchased('alice')).toBe(true);
    expect(await service.attemptPurchase('bob')).toEqual({ status: 'ended', secured: false });
  });

  it('endNow() ends an upcoming sale immediately instead of leaving it stuck as upcoming', async () => {
    const now = { value: START - 60_000 }; // before saleStart: sale hasn't opened yet
    const { service } = makeService(now, 3);
    await service.init();
    expect((await service.getStatus()).status).toBe('upcoming');

    const status = await service.endNow();
    expect(status.status).toBe('ended');
    expect(await service.attemptPurchase('alice')).toEqual({ status: 'ended', secured: false });
  });

  it('revokePurchase() releases a unit and lets the user (or someone else) buy again', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now, 2);
    await service.init();

    await service.attemptPurchase('alice');
    expect((await service.getStatus()).remainingStock).toBe(1);

    const result = await service.revokePurchase('alice');
    expect(result).toEqual({ status: 'revoked', userId: 'alice' });
    expect(await service.hasPurchased('alice')).toBe(false);
    expect((await service.getStatus()).remainingStock).toBe(2);

    expect(await service.attemptPurchase('alice')).toEqual({ status: 'success', secured: true });
  });

  it('revokePurchase() reports not_found for a user who never bought, and trims the id', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now, 2);
    await service.init();

    expect(await service.revokePurchase(' ghost ')).toEqual({ status: 'not_found', userId: 'ghost' });
    expect((await service.getStatus()).remainingStock).toBe(2);
  });

  it('revokePurchase() rejects empty / whitespace user ids', async () => {
    const now = { value: START + 60_000 };
    const { service } = makeService(now);
    await service.init();

    await expect(service.revokePurchase('   ')).rejects.toBeInstanceOf(InvalidUserIdError);
  });
});
