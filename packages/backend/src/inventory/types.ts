/**
 * Result of a single atomic purchase attempt against the inventory core.
 *
 * These three outcomes are the *only* things the inventory layer knows about.
 * Sale-window concerns (upcoming / ended) live one layer up in FlashSaleService,
 * because they are time-based policy rather than inventory state.
 */
export type PurchaseOutcome = 'success' | 'already_purchased' | 'sold_out';

/**
 * The inventory core: the single source of truth for "how many units are left"
 * and "who has already bought". Every implementation MUST guarantee that
 * `attemptPurchase` is atomic with respect to concurrent callers so that:
 *
 *   1. No overselling  - the number of `success` results never exceeds initial stock.
 *   2. One item per user - a given userId receives at most one `success`.
 *
 * Two adapters implement this:
 *   - InMemoryInventoryStore: single-process, relies on Node's single-threaded
 *     event loop (the critical section is fully synchronous).
 *   - RedisInventoryStore: multi-process / horizontally scalable, relies on a
 *     Redis Lua script that Redis executes atomically.
 */
export interface InventoryStore {
  /**
   * Initialise (or re-initialise) the store with the given stock level and an
   * empty buyer set. Safe to call on startup and in test setup.
   */
  init(totalStock: number): Promise<void>;

  /**
   * Atomically attempt to reserve one unit for `userId`.
   * Returns exactly one of the three outcomes. Never throws for the normal
   * business outcomes - only for genuine infrastructure failures.
   */
  attemptPurchase(userId: string): Promise<PurchaseOutcome>;

  /** Whether this user has already secured a unit. */
  hasPurchased(userId: string): Promise<boolean>;

  /** Units still available (never negative). */
  getRemainingStock(): Promise<number>;

  /** Number of units sold so far. */
  getSoldCount(): Promise<number>;

  /** Release any resources (e.g. Redis connection). */
  close(): Promise<void>;
}
