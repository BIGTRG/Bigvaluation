/**
 * {{BRAND_NAME}} — Server (composition root)
 * Public API for programmatic use (tests, embedding). The runnable entrypoint
 * is main.ts.
 */

export { loadConfig, hasRealProviders } from './config.ts';
export type { ServerConfig } from './config.ts';
export { buildApp } from './buildApp.ts';
export type { BuiltApp, StoresBundle } from './buildApp.ts';
export { parseSeedKey } from './seed.ts';
