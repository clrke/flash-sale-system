import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { FlashSaleService, InvalidUserIdError, InvalidResetDurationError } from './service/FlashSaleService.js';

/** Default window applied by `POST /api/sale/reset` when no `durationMs` is given. */
const DEFAULT_RESET_DURATION_MS = 3 * 60 * 1000;

export interface BuildServerOptions {
  service: FlashSaleService;
  logger?: boolean;
  /**
   * Registers `POST /api/sale/reset`, a testing/demo convenience that
   * restarts the sale clock and refills stock. Off by default: it is
   * unauthenticated and would let anyone replay the sale, which is fine for
   * local iteration but wrong for a real deployment. Wired to the
   * `ENABLE_RESET_API` env var in `config.ts` / `index.ts`.
   */
  enableResetApi?: boolean;
}

/**
 * Build the Fastify app around an already-constructed FlashSaleService.
 * Kept as a pure factory (no listen, no process.env) so integration tests can
 * drive it with `app.inject(...)` and no real network.
 *
 * The API layer is intentionally thin and STATELESS: it holds no inventory
 * state of its own, delegating every decision to the service + store. This is
 * what allows running many identical instances behind a load balancer.
 */
export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const { service } = options;

  app.register(cors, { origin: true });

  // Liveness probe.
  app.get('/health', async () => ({ ok: true }));

  // Current sale status + inventory snapshot.
  app.get('/api/sale/status', async () => {
    return service.getStatus();
  });

  // Attempt to purchase one unit for a user.
  app.post('/api/sale/purchase', async (request, reply) => {
    const body = (request.body ?? {}) as { userId?: unknown };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    try {
      const result = await service.attemptPurchase(userId);
      // Map business outcomes to HTTP status codes:
      //   success / already_purchased -> 200 (the user has a unit)
      //   sold_out / not_started / ended -> 409 Conflict (cannot buy right now)
      const httpStatus = result.secured ? 200 : 409;
      return reply.status(httpStatus).send(result);
    } catch (err) {
      if (err instanceof InvalidUserIdError) {
        return reply.status(400).send({ status: 'invalid_user', secured: false, error: err.message });
      }
      throw err;
    }
  });

  // Testing/demo only: restart the sale window and refill stock. Not
  // registered at all unless explicitly enabled, so it 404s by default
  // rather than needing its own runtime guard.
  if (options.enableResetApi) {
    app.post('/api/sale/reset', async (request, reply) => {
      const body = (request.body ?? {}) as { durationMs?: unknown };
      const durationMs = typeof body.durationMs === 'number' ? body.durationMs : DEFAULT_RESET_DURATION_MS;
      try {
        const status = await service.reset(durationMs);
        return reply.send(status);
      } catch (err) {
        if (err instanceof InvalidResetDurationError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    });
  }

  // Check whether a user has already secured a unit.
  app.get('/api/sale/secured', async (request, reply) => {
    const query = (request.query ?? {}) as { userId?: unknown };
    const userId = typeof query.userId === 'string' ? query.userId : '';
    try {
      const secured = await service.hasPurchased(userId);
      return reply.send({ userId, secured });
    } catch (err) {
      if (err instanceof InvalidUserIdError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  return app;
}
