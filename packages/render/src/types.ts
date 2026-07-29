/**
 * {{BRAND_NAME}} — Render connector types (§4.4 dual-layer rendering)
 * Layer 1 (renovation): apply the scope's materials to the real room, geometry
 * preserved. Layer 2 (staging): add furniture/décor on top. Providers (Rendr /
 * REimagineHome / SofaBrain / Roomstage) sit behind RenderProvider so any
 * vendor swaps without touching the app (§6).
 */

export type RenderTier = 'light' | 'medium' | 'high';

export type RenderLayer = 'renovate' | 'stage';

export interface RenderRequest {
  /** Source photo of the real room (URL the provider can fetch). */
  imageUrl: string;
  /** Which layer to apply. 'stage' expects a renovated image as input. */
  layer: RenderLayer;
  /** Room type hint, e.g. 'kitchen', 'bathroom', 'living_room'. */
  room?: string;
  /** Scope tier driving material selection (§4.3 material matrix). */
  tier: RenderTier;
  /** Explicit materials from the Scope-of-Work Studio, when available. */
  materials?: { label: string; category?: string }[];
}

export interface RenderResult {
  /** URL of the rendered image. */
  url: string;
  /** Provider-side id, for audit/debug. */
  providerId?: string;
}

/** A single vendor adapter. Implementations must be stateless per call. */
export interface RenderProvider {
  readonly name: string;
  render(req: RenderRequest): Promise<RenderResult>;
}

/** One room's dual-layer output, in report shape (§3 "AI renders"). */
export interface RoomRenders {
  room: string;
  asIs: string;
  renovated?: string;
  staged?: string;
}
