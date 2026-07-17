/**
 * Result of a single atomic purchase attempt against the inventory core.
 *
 * These three outcomes are the *only* things the inventory layer knows about.
 * Sale-window concerns (upcoming / ended) live one layer up in FlashSaleService,
 * because they are time-based policy rather than inventory state.
 */
export type PurchaseOutcome = 'success' | 'already_purchased' | 'sold_out';

/** Result of revoking a single user's purchase. */
export type RevokeOutcome = 'revoked' | 'not_found';

/**
 * The inventory core: the single source of truth for "how many units are left"
 * and "who has already bought". Every implementation MUST guarantee that
 * `attemptPurchase` is atomic with respect to concurrent callers so that:
 *
 *   1. No overselling  - the number of `success` results never exceeds initial stock.
 *   2. One item per user - a given userId receives at most one `success`.
 *
 * `revokePurchase` must be atomic in the same sense: removing a user from the
 * buyer set and returning their unit to stock is a single indivisible step, so
 * it can never double-refund a concurrent double-revoke, and can never race
 * with an in-flight `attemptPurchase` for the same user in a way that loses a
 * unit or grants two.
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

  /**
   * Atomically release `userId`'s unit back to stock, e.g. for a customer
   * service correction (wrong email, duplicate account, chargeback) without
   * having to reset and wipe every other buyer. Returns `'not_found'` (and
   * leaves stock untouched) if the user never held a unit.
   */
  revokePurchase(userId: string): Promise<RevokeOutcome>;

  /** Whether this user has already secured a unit. */
  hasPurchased(userId: string): Promise<boolean>;

  /** Units still available (never negative). */
  getRemainingStock(): Promise<number>;

  /** Number of units sold so far. */
  getSoldCount(): Promise<number>;

  /** Release any resources (e.g. Redis connection). */
  close(): Promise<void>;
}
