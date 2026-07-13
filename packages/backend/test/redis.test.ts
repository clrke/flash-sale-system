import { describe } from 'vitest';
import { RedisInventoryStore } from '../src/inventory/RedisInventoryStore.js';
import { runInventoryContract } from './contract.js';

/**
 * Runs the full InventoryStore contract (including the heavy concurrency /
 * no-oversell cases) against the real Redis + Lua implementation.
 *
 * Opt-in, because it needs a running Redis. Enable with:
 *   docker compose up -d redis
 *   RUN_REDIS_TESTS=1 REDIS_URL=redis://localhost:6379 npm test
 */
const ENABLED = process.env.RUN_REDIS_TESTS === '1';
const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const suite = ENABLED ? describe : describe.skip;

suite('Redis-backed store', () => {
  let counter = 0;
  runInventoryContract('RedisInventoryStore', () => {
    // Unique key prefix per case so they don't clobber each other; each store
    // owns its own client so contract's store.close() cleanly disconnects it.
    return new RedisInventoryStore({ url: URL, keyPrefix: `flashsale:test:${counter++}` });
  });
});
