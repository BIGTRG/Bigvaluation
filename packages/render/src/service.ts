/**
 * ValueProof — RenderService (§4.4)
 * Orchestrates the two layers per room: renovation first, then staging on top
 * of the renovated image. A provider failure on one room never blocks the
 * others (the pipeline treats visualize as best-effort).
 */

import type { RenderProvider, RenderTier, RoomRenders } from './types.ts';

export interface RenderJobInput {
  /** Captured room photos: room name → source image URL. */
  photos: { room: string; url: string }[];
  tier: RenderTier;
  materials?: { label: string; category?: string }[];
  /** Cap on rooms rendered per job (cost control). Default 6. */
  maxRooms?: number;
}

export class RenderService {
  private readonly provider: RenderProvider;
  private readonly log?: (msg: string) => void;

  constructor(opts: { provider: RenderProvider; log?: (msg: string) => void }) {
    this.provider = opts.provider;
    this.log = opts.log;
  }

  async renderAll(input: RenderJobInput): Promise<RoomRenders[]> {
    const rooms = input.photos.slice(0, input.maxRooms ?? 6);
    const out: RoomRenders[] = [];
    for (const photo of rooms) {
      try {
        out.push(await this.renderRoom(photo, input));
      } catch (err) {
        this.log?.(`render failed for ${photo.room}: ${err instanceof Error ? err.message : String(err)}`);
        out.push({ room: photo.room, asIs: photo.url });
      }
    }
    return out;
  }

  private async renderRoom(photo: { room: string; url: string }, input: RenderJobInput): Promise<RoomRenders> {
    // Layer 1 — renovation on the real room.
    const renovated = await this.provider.render({
      imageUrl: photo.url,
      layer: 'renovate',
      room: photo.room,
      tier: input.tier,
      materials: input.materials,
    });
    // Layer 2 — staging on top of the renovated image.
    let staged: string | undefined;
    try {
      staged = (
        await this.provider.render({
          imageUrl: renovated.url,
          layer: 'stage',
          room: photo.room,
          tier: input.tier,
        })
      ).url;
    } catch (err) {
      this.log?.(`staging failed for ${photo.room}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { room: photo.room, asIs: photo.url, renovated: renovated.url, staged };
  }
}

/** Report-builder shape: pick the hero room's images for the tier (§3). */
export function toReportRenders(
  rooms: RoomRenders[],
  tier: RenderTier,
): Partial<Record<RenderTier, { asIs?: string; renovated?: string; staged?: string }>> {
  const hero = rooms.find((r) => r.renovated) ?? rooms[0];
  if (!hero) return {};
  return { [tier]: { asIs: hero.asIs, renovated: hero.renovated, staged: hero.staged } };
}
