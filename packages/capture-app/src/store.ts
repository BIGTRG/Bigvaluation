/**
 * ValueProof — Capture App (§4.1–4.4)
 * In-memory capture session store for dev/testing.
 * Postgres implementation follows the same pattern as persistence/src/*.
 */

import type { CaptureSession } from './types.ts';
import type { CaptureSessionStore } from './session.ts';

export class InMemoryCaptureStore implements CaptureSessionStore {
  private readonly sessions = new Map<string, CaptureSession>();
  private readonly tokenIndex = new Map<string, string>(); // token → id

  async get(id: string): Promise<CaptureSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async getByToken(token: string): Promise<CaptureSession | null> {
    const id = this.tokenIndex.get(token);
    if (!id) return null;
    return this.sessions.get(id) ?? null;
  }

  async save(session: CaptureSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
    this.tokenIndex.set(session.token, session.id);
  }

  /** Test helper — list all sessions. */
  all(): CaptureSession[] {
    return [...this.sessions.values()];
  }

  /** Test helper — clear all sessions. */
  clear(): void {
    this.sessions.clear();
    this.tokenIndex.clear();
  }
}
