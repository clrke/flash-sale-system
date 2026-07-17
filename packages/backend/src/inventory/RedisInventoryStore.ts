import { Redis } from 'ioredis';
import type { InventoryStore, PurchaseOutcome, RevokeOutcome } from './types.js';
import { PURCHASE_LUA } from './purchaseScript.js';
import { REVOKE_LUA } from './revokeScript.js';

export interface RedisInventoryStoreOptions {
  /** Redis connection string, e.g. redis://localhost:6379 */
  url?: string;
  /** Pass an existing ioredis client instead of a url (useful for tests). */
  client?: Redis;
  /** Key namespace so multiple sales / test runs don't collide. */
  keyPrefix?: string;
}

/**
 * Redis-backed inventory store. This is the horizontally scalable source of
 * truth: any number of stateless backend instances can point at the same Redis
 * and correctness still holds, because the decision is made by a single Lua
 * script that Redis runs atomically.
 *
 * Keys:
 *   {prefix}:stock   -> remaining units (string integer)
 *   {prefix}:buyers  -> SET of userIds that already secured a unit
 */
export class RedisInventoryStore implements InventoryStore {
  private readonly redis: Redis;
  private readonly ownsClient: boolean;
  private readonly stockKey: string;
  private readonly buyersKey: string;

  constructor(options: RedisInventoryStoreOptions = {}) {
    const prefix = options.keyPrefix ?? 'flashsale';
    this.stockKey = `${prefix}:stock`;
    this.buyersKey = `${prefix}:buyers`;

    if (options.client) {
      this.redis = options.client;
      this.ownsClient = false;
    } else {
      this.redis = new Redis(options.url ?? 'redis://localhost:6379', {
        // Fail fast rather than buffering commands forever if Redis is down.
        maxRetriesPerRequest: 2,
      });
      this.ownsClient = true;
    }

    // Register the Lua scripts as custom commands. ioredis handles EVALSHA
    // with an automatic fallback to EVAL if the script isn't cached yet.
    this.redis.defineCommand('flashPurchase', {
      numberOfKeys: 2,
      lua: PURCHASE_LUA,
    });
    this.redis.defineCommand('flashRevoke', {
      numberOfKeys: 2,
      lua: REVOKE_LUA,
    });
  }

  async init(totalStock: number): Promise<void> {
    if (!Number.isInteger(totalStock) || totalStock < 0) {
      throw new Error(`totalStock must be a non-negative integer, got ${totalStock}`);
    }
    // Set stock and clear buyers in a single round-trip transaction.
    await this.redis
      .multi()
      .set(this.stockKey, totalStock)
      .del(this.buyersKey)
      .exec();
  }

  async attemptPurchase(userId: string): Promise<PurchaseOutcome> {
    const code = (await (this.redis as unknown as {
      flashPurchase(
        stockKey: string,
        buyersKey: string,
        userId: string,
      ): Promise<number>;
    }).flashPurchase(this.stockKey, this.buyersKey, userId));

    switch (code) {
      case 1:
        return 'success';
      case 0:
        return 'already_purchased';
      case -1:
        return 'sold_out';
      default:
        throw new Error(`Unexpected purchase script return code: ${code}`);
    }
  }

  async revokePurchase(userId: string): Promise<RevokeOutcome> {
    const code = (await (this.redis as unknown as {
      flashRevoke(
        stockKey: string,
        buyersKey: string,
        userId: string,
      ): Promise<number>;
    }).flashRevoke(this.stockKey, this.buyersKey, userId));

    switch (code) {
      case 1:
        return 'revoked';
      case 0:
        return 'not_found';
      default:
        throw new Error(`Unexpected revoke script return code: ${code}`);
    }
  }

  async hasPurchased(userId: string): Promise<boolean> {
    return (await this.redis.sismember(this.buyersKey, userId)) === 1;
  }

  async getRemainingStock(): Promise<number> {
    const raw = await this.redis.get(this.stockKey);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    return value > 0 ? value : 0;
  }

  async getSoldCount(): Promise<number> {
    return this.redis.scard(this.buyersKey);
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      await this.redis.quit();
    }
  }
}
