/**
 * {{BRAND_NAME}} — Server entrypoint.
 * Builds the app from env config, starts the HTTP server, and shuts down
 * gracefully on SIGTERM/SIGINT. This is what the Docker image runs.
 */

import { createHttpServer } from '../../api/src/index.ts';
import { loadConfig } from './config.ts';
import { buildApp } from './buildApp.ts';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = await buildApp(cfg);
  const server = createHttpServer(app.api);

  server.listen(cfg.port, () => {
    console.log(
      `{{BRAND_NAME}} API listening on :${cfg.port} ` +
        `[storage=${app.mode.storage} data=${app.mode.data} env=${cfg.nodeEnv}]`,
    );
    if (app.mode.data === 'mock' && cfg.nodeEnv === 'production') {
      console.warn('WARNING: running in production with the MOCK data provider — set ATTOM_API_KEY.');
    }
    if (cfg.seedApiKey) console.log('Seeded API key is active (dev/first-run).');
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down.`);
    server.close(async () => {
      await app.dispose();
      process.exit(0);
    });
    // Force-exit if connections don't drain promptly.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
