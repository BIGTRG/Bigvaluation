/**
 * {{BRAND_NAME}} — Render (§4.4 dual-layer rendering)
 * Public surface: the swappable provider contract, the two-layer service, and
 * the report adapter.
 */

export * from './types.ts';
export { RenderService, toReportRenders } from './service.ts';
export type { RenderJobInput } from './service.ts';
export { HttpRenderProvider, MockRenderProvider } from './providers.ts';
export type { HttpRenderProviderOptions } from './providers.ts';
