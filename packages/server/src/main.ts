/**
 * ValueProof — Server entrypoint.
 * Builds the app from env config, starts the HTTP server, and shuts down
 * gracefully on SIGTERM/SIGINT. This is what the Docker image runs.
 */

import { createHttpServer } from '../../api/src/index.ts';
import { loadConfig } from './config.ts';
import { buildApp } from './buildApp.ts';
import { marketingPage } from '../../webapp/src/marketing.ts';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = await buildApp(cfg);
  const server = createHttpServer(app.api, {
    mounts: app.webapp ? [{ prefix: '/app', handler: app.webapp }] : [],
    rootHtml: marketingPage(),
    rootRedirect: app.webapp ? '/app' : undefined,
  });

  // §5.3 live valuation monitoring — sweep watches on a fixed cadence.
  let monitorTimer: NodeJS.Timeout | undefined;
  if (cfg.watchIntervalMs > 0) {
    let sweeping = false;
    monitorTimer = setInterval(async () => {
      if (sweeping) return; // never overlap sweeps
      sweeping = true;
      try {
        const r = await app.monitor.tick();
        if (r.checked > 0) {
          console.log(`[watch-monitor] checked=${r.checked} changed=${r.changed} notified=${r.notified} failed=${r.failed}`);
        }
      } catch (err) {
        console.error('[watch-monitor] sweep error:', err);
      } finally {
        sweeping = false;
      }
    }, cfg.watchIntervalMs);
    monitorTimer.unref();
  }

  server.listen(cfg.port, () => {
    console.log(
      `ValueProof API listening on :${cfg.port} ` +
        `[storage=${app.mode.storage} data=${app.mode.data} pdf=${app.mode.pdf} ` +
        `watch=${cfg.watchIntervalMs > 0 ? `${cfg.watchIntervalMs}ms` : 'off'} env=${cfg.nodeEnv}]`,
    );
    if (app.mode.data === 'mock' && cfg.nodeEnv === 'production') {
      console.warn('WARNING: running in production with the MOCK data provider — set ATTOM_API_KEY.');
    }
    if (cfg.seedApiKey) console.log('Seeded API key is active (dev/first-run).');
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down.`);
    if (monitorTimer) clearInterval(monitorTimer);
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
