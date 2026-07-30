/**
 * ValueProof — Property photos (§4.1 capture, §4.4 renders)
 * Uploaded before-photos of the subject property. Stored server-side so the
 * Vision module can read them (base64 → Claude) and the render vendor can
 * fetch them by URL. Ids are unguessable (they double as the public token for
 * GET /photos/:id, which render vendors need — same pattern as material links).
 */

export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface PhotoRecord {
  /** Unguessable id, e.g. `ph_<hex>`; doubles as the public fetch token. */
  id: string;
  accountId: string;
  /** Room / area label: 'kitchen', 'exterior_front', ... */
  label?: string;
  mediaType: PhotoMediaType;
  /** Base64-encoded image bytes. */
  dataBase64: string;
  createdAt: number;
}

export interface PhotoStore {
  insert(photo: PhotoRecord): Promise<void>;
  /** Fetch by id. Public reads pass no accountId (unguessable id is the auth). */
  findById(id: string): Promise<PhotoRecord | null>;
  listByAccount(accountId: string, limit?: number): Promise<PhotoRecord[]>;
}

export class InMemoryPhotoStore implements PhotoStore {
  private readonly rows = new Map<string, PhotoRecord>();

  async insert(photo: PhotoRecord): Promise<void> {
    this.rows.set(photo.id, photo);
  }

  async findById(id: string): Promise<PhotoRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async listByAccount(accountId: string, limit = 100): Promise<PhotoRecord[]> {
    return [...this.rows.values()]
      .filter((p) => p.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

export const PHOTO_MEDIA_TYPES: PhotoMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];

/** ~12 MB of base64 (≈9 MB image) — matches the HTTP layer's body cap. */
export const MAX_PHOTO_BASE64_LENGTH = 12_000_000;
