import { loadConfig, createStore } from './config.js';
import { FlashSaleService } from './service/FlashSaleService.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store = createStore(config);

  const service = new FlashSaleService({
    store,
    totalStock: config.totalStock,
    saleStart: config.saleStart,
    saleEnd: config.saleEnd,
  });
  await service.init();

  const app = buildServer({ service, logger: true });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      store: config.storeKind,
      totalStock: config.totalStock,
      saleStart: new Date(config.saleStart).toISOString(),
      saleEnd: new Date(config.saleEnd).toISOString(),
    },
    'Flash sale backend ready',
  );
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
