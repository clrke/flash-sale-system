import type { InventoryStore } from '../inventory/types.js';

export type SaleStatus = 'upcoming' | 'active' | 'ended';

/**
 * Static presentation metadata for the single product on sale. Not part of the
 * inventory core (which only cares about counts); this is display-only data
 * surfaced to the UI alongside the live status.
 */
export interface ProductInfo {
  name: string;
  tagline: string;
  price: string; // display string, e.g. "$149"
  imageUrl: string;
}

/**
 * Outcome of a purchase attempt as seen by the API/UI. Extends the three
 * inventory outcomes with the two time-window outcomes owned by this service.
 */
export type PurchaseResultStatus =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_started'
  | 'ended';

export interface SaleStatusView {
  status: SaleStatus;
  product: ProductInfo;
  totalStock: number;
  remainingStock: number;
  soldCount: number;
  saleStart: string; // ISO
  saleEnd: string; // ISO
  serverTime: string; // ISO
}

export interface PurchaseResult {
  status: PurchaseResultStatus;
  /** True only when status === 'success' or 'already_purchased'. */
  secured: boolean;
}

export interface FlashSaleServiceOptions {
  store: InventoryStore;
  product: ProductInfo;
  totalStock: number;
  saleStart: number; // epoch ms
  saleEnd: number; // epoch ms
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Application-level policy around the inventory core.
 *
 * Responsibilities that are NOT the inventory core's job live here:
 *   - the configurable sale window (upcoming / active / ended)
 *   - input validation (non-empty userId)
 *   - shaping the outcome into an API/UI-friendly result
 *
 * Correctness note: the window check is deliberately OUTSIDE the atomic
 * inventory op. That is safe because the window is coarse-grained time policy;
 * the invariants that actually need atomicity (no oversell, one-per-user) are
 * fully enforced inside `store.attemptPurchase`.
 */
export class FlashSaleService {
  private readonly store: InventoryStore;
  private readonly product: ProductInfo;
  private readonly totalStock: number;
  private saleStart: number;
  private saleEnd: number;
  private readonly now: () => number;

  constructor(options: FlashSaleServiceOptions) {
    this.store = options.store;
    this.product = options.product;
    this.totalStock = options.totalStock;
    this.saleStart = options.saleStart;
    this.saleEnd = options.saleEnd;
    this.now = options.now ?? Date.now;
  }

  /** Initialise the underlying inventory (idempotent). */
  async init(): Promise<void> {
    await this.store.init(this.totalStock);
  }

  private saleStatusAt(nowMs: number): SaleStatus {
    if (nowMs < this.saleStart) return 'upcoming';
    if (nowMs >= this.saleEnd) return 'ended';
    return 'active';
  }

  async getStatus(): Promise<SaleStatusView> {
    const nowMs = this.now();
    const [remainingStock, soldCount] = await Promise.all([
      this.store.getRemainingStock(),
      this.store.getSoldCount(),
    ]);
    return {
      status: this.saleStatusAt(nowMs),
      product: this.product,
      totalStock: this.totalStock,
      remainingStock,
      soldCount,
      saleStart: new Date(this.saleStart).toISOString(),
      saleEnd: new Date(this.saleEnd).toISOString(),
      serverTime: new Date(nowMs).toISOString(),
    };
  }

  async attemptPurchase(userId: string): Promise<PurchaseResult> {
    const trimmed = typeof userId === 'string' ? userId.trim() : '';
    if (trimmed === '') {
      throw new InvalidUserIdError();
    }

    const status = this.saleStatusAt(this.now());
    if (status === 'upcoming') return { status: 'not_started', secured: false };
    if (status === 'ended') return { status: 'ended', secured: false };

    const outcome = await this.store.attemptPurchase(trimmed);
    switch (outcome) {
      case 'success':
        return { status: 'success', secured: true };
      case 'already_purchased':
        return { status: 'already_purchased', secured: true };
      case 'sold_out':
        return { status: 'sold_out', secured: false };
    }
  }

  async hasPurchased(userId: string): Promise<boolean> {
    const trimmed = typeof userId === 'string' ? userId.trim() : '';
    if (trimmed === '') throw new InvalidUserIdError();
    return this.store.hasPurchased(trimmed);
  }

  /**
   * Testing/demo convenience: restart the sale clock (a fresh `durationMs`
   * window starting now) and refill stock back to the originally configured
   * `totalStock`, clearing every recorded buyer. NOT part of the take-home
   * brief - exists purely so a reviewer or the candidate can replay the full
   * sale lifecycle without restarting the process. The API layer is
   * responsible for keeping this behind an explicit opt-in; the service
   * itself has no notion of "is this safe to expose".
   */
  async reset(durationMs: number): Promise<SaleStatusView> {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new InvalidResetDurationError();
    }
    const start = this.now();
    this.saleStart = start;
    this.saleEnd = start + durationMs;
    await this.store.init(this.totalStock);
    return this.getStatus();
  }
}

export class InvalidUserIdError extends Error {
  constructor() {
    super('userId is required and must be a non-empty string');
    this.name = 'InvalidUserIdError';
  }
}

export class InvalidResetDurationError extends Error {
  constructor() {
    super('durationMs must be a positive number');
    this.name = 'InvalidResetDurationError';
  }
}
