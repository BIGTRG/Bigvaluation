import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CaptureManager,
  CaptureError,
  InMemoryCaptureStore,
  PHOTO_WALKTHROUGH,
  requiredPhotos,
  photosByCategory,
  missingRequired,
  captureProgress,
  renderCaptureHtml,
} from '../src/index.ts';
import type { CapturedPhoto } from '../src/types.ts';
import type { PropertyPhoto, ConditionAssessment } from '../../vision/src/types.ts';

// --- helpers ---------------------------------------------------------------

function makePhoto(key: string): CapturedPhoto {
  return {
    requirementKey: key,
    data: 'dGVzdA==', // base64 "test"
    mediaType: 'image/jpeg',
    capturedAt: '2026-07-26T16:00:00Z',
    sizeBytes: 4,
  };
}

function allRequiredPhotos(): CapturedPhoto[] {
  return requiredPhotos().map((r) => makePhoto(r.key));
}

/** Fake vision scorer that returns a fixed score. */
function fakeScorer(score: number): { score: (photos: PropertyPhoto[]) => Promise<ConditionAssessment> } {
  return {
    async score(photos: PropertyPhoto[]): Promise<ConditionAssessment> {
      return {
        overallScore: score,
        dimensions: [{ dimension: 'overall', score, reasoning: 'test' }],
        summary: 'Test assessment',
        photosAnalyzed: photos.length,
        model: 'test-model',
      };
    },
  };
}

/** Fake valuation trigger. */
function fakeTrigger(): { createJob: (input: Record<string, unknown>) => Promise<{ id: string }> } {
  return {
    async createJob(_input: Record<string, unknown>): Promise<{ id: string }> {
      return { id: 'job_test_1' };
    },
  };
}

// --- walkthrough tests -----------------------------------------------------

describe('walkthrough', () => {
  it('has at least 10 photo requirements', () => {
    assert.ok(PHOTO_WALKTHROUGH.length >= 10);
  });

  it('has required photos', () => {
    const required = requiredPhotos();
    assert.ok(required.length >= 8);
    assert.ok(required.every((r) => r.required));
  });

  it('filters by category', () => {
    const exterior = photosByCategory('exterior');
    assert.ok(exterior.length >= 4);
    assert.ok(exterior.every((r) => r.category === 'exterior'));
  });

  it('identifies missing required photos', () => {
    const captured = new Set(['exterior_front']);
    const missing = missingRequired(captured);
    const required = requiredPhotos();
    assert.equal(missing.length, required.length - 1);
  });

  it('reports correct progress', () => {
    const captured = new Set(['exterior_front', 'exterior_left']);
    const progress = captureProgress(captured);
    assert.equal(progress.captured, 2);
    assert.equal(progress.requiredCaptured, 2);
    assert.equal(progress.complete, false);
    assert.ok(progress.percent > 0);
    assert.ok(progress.percent < 100);
  });

  it('reports complete when all required captured', () => {
    const keys = new Set(requiredPhotos().map((r) => r.key));
    const progress = captureProgress(keys);
    assert.equal(progress.complete, true);
    assert.equal(progress.percent, 100);
  });
});

// --- CaptureManager tests --------------------------------------------------

describe('CaptureManager', () => {
  let store: InMemoryCaptureStore;
  let manager: CaptureManager;
  let clock: { now: () => number };

  beforeEach(() => {
    store = new InMemoryCaptureStore();
    clock = { now: () => 1000000 };
    manager = new CaptureManager({ store, clock });
  });

  it('creates a session with token', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    assert.ok(session.id.startsWith('cap_'));
    assert.ok(session.token.startsWith('tok_'));
    assert.equal(session.accountId, 'acct_1');
    assert.equal(session.subject.address, '123 Test St');
    assert.equal(session.status, 'created');
    assert.equal(session.photos.length, 0);
    assert.ok(session.expiresAt > session.createdAt);
  });

  it('retrieves session by token', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    const retrieved = await manager.getByToken(session.token);
    assert.ok(retrieved);
    assert.equal(retrieved!.id, session.id);
  });

  it('returns null for expired sessions', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    // Advance clock past expiry (use > expiresAt, since <= triggers expired)
    clock.now = () => session.expiresAt;
    const retrieved = await manager.getByToken(session.token);
    assert.equal(retrieved, null);
  });

  it('returns null for unknown token', async () => {
    const retrieved = await manager.getByToken('tok_nonexistent');
    assert.equal(retrieved, null);
  });

  it('accepts partial photo submission (in_progress)', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    const result = await manager.submitPhotos({
      sessionId: session.id,
      token: session.token,
      photos: [makePhoto('exterior_front')],
    });
    assert.equal(result.status, 'in_progress');
    assert.equal(result.photosAccepted, 1);
  });

  it('marks photos_complete when all required photos submitted (no scorer)', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    const result = await manager.submitPhotos({
      sessionId: session.id,
      token: session.token,
      photos: allRequiredPhotos(),
    });
    assert.equal(result.status, 'photos_complete');
    assert.equal(result.photosAccepted, allRequiredPhotos().length);
  });

  it('scores condition when scorer is provided', async () => {
    manager = new CaptureManager({ store, clock, scorer: fakeScorer(3.5) });
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    const result = await manager.submitPhotos({
      sessionId: session.id,
      token: session.token,
      photos: allRequiredPhotos(),
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.conditionScore, 3.5);
    assert.ok(result.assessment);
  });

  it('triggers valuation when scorer + trigger configured', async () => {
    manager = new CaptureManager({
      store, clock,
      scorer: fakeScorer(2),
      valuation: fakeTrigger(),
    });
    const session = await manager.createSession('acct_1', { address: '123 Test St', sqft: 1400 }, 'https://capture.test.com');
    const result = await manager.submitPhotos({
      sessionId: session.id,
      token: session.token,
      photos: allRequiredPhotos(),
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.conditionScore, 2);
    assert.equal(result.valuationJobId, 'job_test_1');
  });

  it('throws on invalid token', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    await assert.rejects(
      () => manager.submitPhotos({ sessionId: session.id, token: 'wrong', photos: [makePhoto('exterior_front')] }),
      (err: unknown) => err instanceof CaptureError && err.code === 'NOT_FOUND',
    );
  });

  it('throws on expired session', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    // First call to getByToken with expired clock will mark it expired and return null.
    // submitPhotos calls store.getByToken directly, so we need to ensure the session
    // is found but expired. Advance clock to exactly expiresAt.
    clock.now = () => session.expiresAt;
    await assert.rejects(
      () => manager.submitPhotos({ sessionId: session.id, token: session.token, photos: [makePhoto('exterior_front')] }),
      (err: unknown) => err instanceof CaptureError && err.code === 'EXPIRED',
    );
  });

  it('throws on empty photos', async () => {
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    await assert.rejects(
      () => manager.submitPhotos({ sessionId: session.id, token: session.token, photos: [] }),
      (err: unknown) => err instanceof CaptureError && err.code === 'NO_PHOTOS',
    );
  });

  it('throws on already complete session', async () => {
    manager = new CaptureManager({ store, clock, scorer: fakeScorer(4) });
    const session = await manager.createSession('acct_1', { address: '123 Test St' }, 'https://capture.test.com');
    await manager.submitPhotos({ sessionId: session.id, token: session.token, photos: allRequiredPhotos() });
    await assert.rejects(
      () => manager.submitPhotos({ sessionId: session.id, token: session.token, photos: [makePhoto('damage_1')] }),
      (err: unknown) => err instanceof CaptureError && err.code === 'ALREADY_COMPLETE',
    );
  });
});

// --- renderCaptureHtml tests -----------------------------------------------

describe('renderCaptureHtml', () => {
  it('renders valid HTML with session data', () => {
    const session = {
      id: 'cap_test',
      token: 'tok_test',
      accountId: 'acct_1',
      subject: { address: '456 Oak Ave, Charlotte, NC 28202', sqft: 1800, beds: 3, baths: 2 },
      status: 'created' as const,
      photos: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
    const html = renderCaptureHtml(session, 'https://api.test.com');
    assert.ok(html.includes('456 Oak Ave'));
    assert.ok(html.includes('1,800 sqft'));
    assert.ok(html.includes('Property Capture'));
    assert.ok(html.includes('cap_test'));
    assert.ok(html.includes('tok_test'));
    assert.ok(html.includes('REQUIRED'));
    assert.ok(html.includes('Submit Photos'));
  });

  it('marks captured photos as complete', () => {
    const session = {
      id: 'cap_test',
      token: 'tok_test',
      accountId: 'acct_1',
      subject: { address: '456 Oak Ave' },
      status: 'in_progress' as const,
      photos: [makePhoto('exterior_front')],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
    const html = renderCaptureHtml(session, 'https://api.test.com');
    assert.ok(html.includes('captured'));
    assert.ok(html.includes('✅'));
  });
});
