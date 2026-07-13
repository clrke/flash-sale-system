import { describe, it, expect } from 'vitest';
import type { InventoryStore, PurchaseOutcome } from '../src/inventory/types.js';

/**
 * A reusable contract every InventoryStore implementation must satisfy.
 * Lives in a `.ts` (not `.test.ts`) file so importing it does NOT re-trigger
 * a suite; each store's own test file calls it once.
 */
export function runInventoryContract(
  name: string,
  makeStore: () => InventoryStore | Promise<InventoryStore>,
): void {
  describe(`InventoryStore contract: ${name}`, () => {
    it('sells exactly one unit to a single buyer', async () => {
      const store = await makeStore();
      await store.init(5);

      expect(await store.attemptPurchase('alice')).toBe('success');
      expect(await store.hasPurchased('alice')).toBe(true);
      expect(await store.getRemainingStock()).toBe(4);
      expect(await store.getSoldCount()).toBe(1);
      await store.close();
    });

    it('enforces one item per user (sequential)', async () => {
      const store = await makeStore();
      await store.init(5);

      expect(await store.attemptPurchase('bob')).toBe('success');
      expect(await store.attemptPurchase('bob')).toBe('already_purchased');
      expect(await store.attemptPurchase('bob')).toBe('already_purchased');

      expect(await store.getRemainingStock()).toBe(4);
      expect(await store.getSoldCount()).toBe(1);
      await store.close();
    });

    it('reports sold_out once stock is exhausted', async () => {
      const store = await makeStore();
      await store.init(2);

      expect(await store.attemptPurchase('u1')).toBe('success');
      expect(await store.attemptPurchase('u2')).toBe('success');
      expect(await store.attemptPurchase('u3')).toBe('sold_out');
      expect(await store.getRemainingStock()).toBe(0);
      await store.close();
    });

    it('never oversells under heavy concurrency (unique buyers)', async () => {
      const store = await makeStore();
      const STOCK = 100;
      const CONTENDERS = 2000;
      await store.init(STOCK);

      const outcomes = await Promise.all(
        Array.from({ length: CONTENDERS }, (_, i) => store.attemptPurchase(`user-${i}`)),
      );

      const tally = count(outcomes);
      expect(tally.success).toBe(STOCK);
      expect(tally.sold_out).toBe(CONTENDERS - STOCK);
      expect(tally.already_purchased).toBe(0);
      expect(await store.getRemainingStock()).toBe(0);
      expect(await store.getSoldCount()).toBe(STOCK);
      await store.close();
    });

    it('enforces one-per-user even when the same user floods concurrently', async () => {
      const store = await makeStore();
      await store.init(100);

      const outcomes = await Promise.all(
        Array.from({ length: 200 }, () => store.attemptPurchase('spammer')),
      );

      const tally = count(outcomes);
      expect(tally.success).toBe(1);
      expect(tally.already_purchased).toBe(199);
      expect(await store.getRemainingStock()).toBe(99);
      expect(await store.getSoldCount()).toBe(1);
      await store.close();
    });
  });
}

function count(outcomes: PurchaseOutcome[]): Record<PurchaseOutcome, number> {
  const tally: Record<PurchaseOutcome, number> = {
    success: 0,
    already_purchased: 0,
    sold_out: 0,
  };
  for (const o of outcomes) tally[o] += 1;
  return tally;
}
