/**
 * ValueProof — Capture App (§4.1–4.4)
 * Capture session manager — creates tokenized sessions, validates photo
 * submissions, triggers vision scoring, and bridges to the valuation pipeline.
 */

import type {
  CaptureSession,
  CaptureStatus,
  CapturedPhoto,
  SubmitPhotosRequest,
  SubmitPhotosResult,
} from './types.ts';
import type { PropertyPhoto, ConditionAssessment } from '../../vision/src/types.ts';
import { missingRequired } from './walkthrough.ts';

/** Session storage interface — implemented by in-memory or Postgres stores. */
export interface CaptureSessionStore {
  get(id: string): Promise<CaptureSession | null>;
  getByToken(token: string): Promise<CaptureSession | null>;
  save(session: CaptureSession): Promise<void>;
}

/** Vision scorer interface — matches ConditionScorer.score signature. */
export interface VisionScorer {
  score(photos: PropertyPhoto[]): Promise<ConditionAssessment>;
}

/** Valuation trigger — kicks off a valuation job from the capture result. */
export interface ValuationTrigger {
  createJob(input: Record<string, unknown>): Promise<{ id: string }>;
}

export interface CaptureManagerConfig {
  store: CaptureSessionStore;
  scorer?: VisionScorer;
  valuation?: ValuationTrigger;
  /** Session TTL in ms. Default: 24 hours. */
  sessionTtlMs?: number;
  /** Clock injection for testing. */
  clock?: { now: () => number };
  /** ID factory for testing. */
  idFactory?: () => string;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
let counter = 0;

function defaultId(): string {
  return `cap_${(++counter).toString(36)}${Date.now().toString(36)}`;
}

function defaultToken(): string {
  // Simple token — in production, use crypto.randomUUID() or similar.
  return `tok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class CaptureManager {
  private readonly store: CaptureSessionStore;
  private readonly scorer?: VisionScorer;
  private readonly valuation?: ValuationTrigger;
  private readonly ttl: number;
  private readonly clock: { now: () => number };
  private readonly newId: () => string;

  constructor(cfg: CaptureManagerConfig) {
    this.store = cfg.store;
    this.scorer = cfg.scorer;
    this.valuation = cfg.valuation;
    this.ttl = cfg.sessionTtlMs ?? DEFAULT_TTL;
    this.clock = cfg.clock ?? { now: () => Date.now() };
    this.newId = cfg.idFactory ?? defaultId;
  }

  private now(): number {
    return this.clock.now();
  }

  /**
   * Create a new capture session. Returns the session with a tokenized URL
   * that can be sent to a mobile device (SMS/email/QR).
   */
  async createSession(
    accountId: string,
    subject: CaptureSession['subject'],
    baseUrl: string,
  ): Promise<CaptureSession> {
    const now = this.now();
    const id = this.newId();
    const token = defaultToken();

    const session: CaptureSession = {
      id,
      token,
      accountId,
      subject,
      status: 'created',
      photos: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.ttl,
    };

    await this.store.save(session);
    return session;
  }

  /**
   * Get a session by token (for the mobile capture app).
   * Returns null if expired or not found.
   */
  async getByToken(token: string): Promise<CaptureSession | null> {
    const session = await this.store.getByToken(token);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      session.status = 'expired';
      session.updatedAt = this.now();
      await this.store.save(session);
      return null;
    }
    return session;
  }

  /**
   * Submit photos for a capture session. Validates the token, stores photos,
   * optionally triggers vision scoring, and optionally kicks off valuation.
   */
  async submitPhotos(req: SubmitPhotosRequest): Promise<SubmitPhotosResult> {
    const session = await this.store.getByToken(req.token);
    if (!session || session.id !== req.sessionId) {
      throw new CaptureError('Session not found or invalid token', 'NOT_FOUND');
    }
    if (session.expiresAt <= this.now()) {
      session.status = 'expired';
      session.updatedAt = this.now();
      await this.store.save(session);
      throw new CaptureError('Session expired', 'EXPIRED');
    }
    if (session.status === 'complete') {
      throw new CaptureError('Session already complete', 'ALREADY_COMPLETE');
    }

    // Validate minimum photos
    if (req.photos.length === 0) {
      throw new CaptureError('At least one photo is required', 'NO_PHOTOS');
    }

    // Store photos
    session.photos = [...session.photos, ...req.photos];
    session.status = 'photos_complete';
    session.updatedAt = this.now();

    // Check completeness
    const capturedKeys = new Set(session.photos.map((p) => p.requirementKey));
    const missing = missingRequired(capturedKeys);
    if (missing.length > 0) {
      session.status = 'in_progress';
      await this.store.save(session);
      return {
        sessionId: session.id,
        status: session.status,
        photosAccepted: req.photos.length,
      };
    }

    // All required photos captured — trigger vision scoring if available
    if (this.scorer) {
      session.status = 'scoring';
      await this.store.save(session);

      try {
        const visionPhotos: PropertyPhoto[] = session.photos.map((p) => ({
          data: p.data,
          mediaType: p.mediaType,
          label: p.requirementKey,
        }));

        const assessment = await this.scorer.score(visionPhotos);
        session.conditionScore = assessment.overallScore;
        session.visionAssessment = assessment;
        session.status = 'complete';
      } catch (err) {
        // Vision failed — mark complete without score, caller can provide manually.
        session.status = 'photos_complete';
        session.updatedAt = this.now();
        await this.store.save(session);
        return {
          sessionId: session.id,
          status: session.status,
          photosAccepted: req.photos.length,
        };
      }
    } else {
      session.status = 'photos_complete';
    }

    // Trigger valuation if configured and we have a condition score
    if (this.valuation && session.conditionScore) {
      try {
        const job = await this.valuation.createJob({
          subject: {
            address: session.subject.address,
            sqft: session.subject.sqft,
            beds: session.subject.beds,
            baths: session.subject.baths,
            yearBuilt: session.subject.yearBuilt,
            radiusMiles: 2,
          },
          conditionScore: session.conditionScore,
        });
        session.valuationJobId = job.id;
      } catch {
        // Valuation trigger failed — non-fatal, session is still complete.
      }
    }

    session.updatedAt = this.now();
    await this.store.save(session);

    return {
      sessionId: session.id,
      status: session.status,
      photosAccepted: req.photos.length,
      conditionScore: session.conditionScore,
      assessment: session.visionAssessment,
      valuationJobId: session.valuationJobId,
    };
  }

  /**
   * Get session by ID (for the API — requires account ownership check by caller).
   */
  async getSession(id: string): Promise<CaptureSession | null> {
    return this.store.get(id);
  }
}

export class CaptureError extends Error {
  readonly code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_COMPLETE' | 'NO_PHOTOS';
  constructor(message: string, code: CaptureError['code']) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
  }
}
