import type { InventoryStore } from './inventory/types.js';
import { InMemoryInventoryStore } from './inventory/InMemoryInventoryStore.js';
import { RedisInventoryStore } from './inventory/RedisInventoryStore.js';
import type { ProductInfo } from './service/FlashSaleService.js';

export interface AppConfig {
  port: number;
  host: string;
  product: ProductInfo;
  totalStock: number;
  saleStart: number; // epoch ms
  saleEnd: number; // epoch ms
  storeKind: 'memory' | 'redis';
  redisUrl: string;
}

/**
 * Presentation metadata for the product on sale. Fully env-overridable so the
 * same build can front any product. The default imageUrl is a real photo
 * bundled with the frontend (`packages/frontend/public/product.jpg`), so the
 * demo shows an actual product image with zero external dependencies.
 */
function loadProduct(): ProductInfo {
  return {
    name: process.env.PRODUCT_NAME ?? 'Aurora Wireless Headphones',
    tagline: process.env.PRODUCT_TAGLINE ?? 'Studio-grade sound, 40-hour battery, strictly limited drop.',
    price: process.env.PRODUCT_PRICE ?? '$149',
    imageUrl: process.env.PRODUCT_IMAGE_URL ?? '/product.jpg',
  };
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Env ${name} must be an integer, got "${raw}"`);
  return parsed;
}

function timeFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw new Error(`Env ${name} must be an ISO 8601 timestamp, got "${raw}"`);
  return ms;
}

/**
 * Build the app config from environment variables, applying sensible defaults
 * so the system runs with zero configuration (`npm run dev`):
 *   - in-memory store
 *   - 100 units of stock
 *   - a sale that starts now and runs for one hour
 */
export function loadConfig(now: number = Date.now()): AppConfig {
  const totalStock = intFromEnv('TOTAL_STOCK', 100);
  const durationMs = intFromEnv('SALE_DURATION_MS', 60 * 60 * 1000);

  const saleStart = timeFromEnv('SALE_START') ?? now;
  const saleEnd = timeFromEnv('SALE_END') ?? saleStart + durationMs;

  if (saleEnd <= saleStart) {
    throw new Error('SALE_END must be after SALE_START');
  }

  const storeKind = (process.env.STORE ?? 'memory').toLowerCase() === 'redis' ? 'redis' : 'memory';

  return {
    port: intFromEnv('PORT', 3000),
    host: process.env.HOST ?? '0.0.0.0',
    product: loadProduct(),
    totalStock,
    saleStart,
    saleEnd,
    storeKind,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  };
}

/** Instantiate the inventory store selected by config. */
export function createStore(config: AppConfig): InventoryStore {
  if (config.storeKind === 'redis') {
    return new RedisInventoryStore({ url: config.redisUrl });
  }
  return new InMemoryInventoryStore();
}
