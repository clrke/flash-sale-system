import type { InventoryStore, PurchaseOutcome, RevokeOutcome } from './types.js';

/**
 * In-memory inventory store.
 *
 * Why this is correct without locks: Node.js runs JavaScript on a single
 * thread. `attemptPurchase` performs its check-and-mutate (read stock -> read
 * buyer set -> decrement -> record buyer) with NO `await` in the critical
 * section, so the event loop cannot interleave another purchase in the middle.
 * The whole method body is therefore an atomic critical section by construction.
 *
 * This adapter needs zero external dependencies, which lets a reviewer run and
 * stress-test the full system with a single `npm run dev` / `npm test`. Its
 * limitation is that it is single-process only: state is not shared across
 * horizontally scaled instances. That is exactly what the Redis adapter solves.
 */
export class InMemoryInventoryStore implements InventoryStore {
  private stock = 0;
  private readonly buyers = new Set<string>();

  async init(totalStock: number): Promise<void> {
    if (!Number.isInteger(totalStock) || totalStock < 0) {
      throw new Error(`totalStock must be a non-negative integer, got ${totalStock}`);
    }
    this.stock = totalStock;
    this.buyers.clear();
  }

  async attemptPurchase(userId: string): Promise<PurchaseOutcome> {
    // ---- begin atomic critical section (no awaits below) ----
    if (this.buyers.has(userId)) {
      return 'already_purchased';
    }
    if (this.stock <= 0) {
      return 'sold_out';
    }
    this.stock -= 1;
    this.buyers.add(userId);
    return 'success';
    // ---- end atomic critical section ----
  }

  async revokePurchase(userId: string): Promise<RevokeOutcome> {
    // ---- begin atomic critical section (no awaits below) ----
    if (!this.buyers.has(userId)) {
      return 'not_found';
    }
    this.buyers.delete(userId);
    this.stock += 1;
    return 'revoked';
    // ---- end atomic critical section ----
  }

  async hasPurchased(userId: string): Promise<boolean> {
    return this.buyers.has(userId);
  }

  async getRemainingStock(): Promise<number> {
    return this.stock;
  }

  async getSoldCount(): Promise<number> {
    return this.buyers.size;
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
