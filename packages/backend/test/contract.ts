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

    it('revokePurchase releases a buyer\'s unit back to stock', async () => {
      const store = await makeStore();
      await store.init(5);
      await store.attemptPurchase('alice');

      expect(await store.revokePurchase('alice')).toBe('revoked');
      expect(await store.hasPurchased('alice')).toBe(false);
      expect(await store.getRemainingStock()).toBe(5);
      expect(await store.getSoldCount()).toBe(0);

      // The unit is genuinely back on the shelf: alice (or anyone else) can buy again.
      expect(await store.attemptPurchase('alice')).toBe('success');
      await store.close();
    });

    it('revokePurchase on a non-buyer reports not_found and leaves stock untouched', async () => {
      const store = await makeStore();
      await store.init(5);
      await store.attemptPurchase('alice');

      expect(await store.revokePurchase('never-bought')).toBe('not_found');
      expect(await store.getRemainingStock()).toBe(4);
      expect(await store.getSoldCount()).toBe(1);
      await store.close();
    });

    it('revokePurchase never double-refunds under concurrent revokes of the same user', async () => {
      const store = await makeStore();
      await store.init(5);
      await store.attemptPurchase('alice');

      const outcomes = await Promise.all(
        Array.from({ length: 50 }, () => store.revokePurchase('alice')),
      );

      expect(outcomes.filter((o) => o === 'revoked')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'not_found')).toHaveLength(49);
      expect(await store.getRemainingStock()).toBe(5);
      expect(await store.getSoldCount()).toBe(0);
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
