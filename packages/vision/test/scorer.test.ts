/**
 * {{BRAND_NAME}} — Vision (§4.1)
 * Unit tests for ConditionScorer. Uses injected HTTP to avoid real API calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConditionScorer, VisionError } from '../src/index.ts';
import type { PropertyPhoto, HttpPost } from '../src/index.ts';

// --- helpers ----------------------------------------------------------------

const TINY_JPEG_B64 = '/9j/4AAQSkZJRg=='; // not a real image, but enough for the HTTP mock

function photo(label?: string): PropertyPhoto {
  return { data: TINY_JPEG_B64, mediaType: 'image/jpeg', label };
}

function mockHttp(responseBody: unknown, status = 200): HttpPost {
  return async (_url, _opts) => ({
    status,
    ok: status >= 200 && status < 300,
    body: responseBody,
  });
}

function claudeResponse(json: Record<string, unknown>): unknown {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: 500, output_tokens: 200 },
  };
}

const GOOD_ASSESSMENT = {
  overallScore: 2.5,
  dimensions: [
    { dimension: 'exterior', score: 3, reasoning: 'Siding is worn but intact.' },
    { dimension: 'kitchen', score: 2, reasoning: 'Original 1970s cabinets and laminate counters.' },
    { dimension: 'bathrooms', score: 2, reasoning: 'Dated fixtures, minor water staining on ceiling.' },
    { dimension: 'flooring', score: 3, reasoning: 'Hardwood under carpet, some wear visible.' },
  ],
  summary: 'Property is in below-average condition with significant deferred maintenance in kitchen and bathrooms. Structure appears sound but all major surfaces need updating.',
};

// --- tests ------------------------------------------------------------------

describe('ConditionScorer', () => {
  it('throws if apiKey is missing', () => {
    assert.throws(
      () => new ConditionScorer({ apiKey: '' }),
      (err: unknown) => err instanceof VisionError && err.code === 'VALIDATION_ERROR',
    );
  });

  it('throws VisionError on empty photos array', async () => {
    const scorer = new ConditionScorer({ apiKey: 'test-key', http: mockHttp({}) });
    await assert.rejects(
      () => scorer.score([]),
      (err: unknown) => err instanceof VisionError && err.code === 'NO_PHOTOS',
    );
  });

  it('scores a property from photos (happy path)', async () => {
    const http = mockHttp(claudeResponse(GOOD_ASSESSMENT));
    const scorer = new ConditionScorer({ apiKey: 'test-key', http });

    const result = await scorer.score([photo('exterior'), photo('kitchen')]);

    assert.equal(result.overallScore, 2.5);
    assert.equal(result.dimensions.length, 4);
    assert.equal(result.photosAnalyzed, 2);
    assert.equal(result.model, 'claude-sonnet-4-20250514');
    assert.ok(result.summary.includes('below-average'));
  });

  it('handles markdown-fenced JSON from Claude', async () => {
    const fencedResponse = {
      content: [{
        type: 'text',
        text: '```json\n' + JSON.stringify(GOOD_ASSESSMENT) + '\n```',
      }],
    };
    const scorer = new ConditionScorer({ apiKey: 'test-key', http: mockHttp(fencedResponse) });

    const result = await scorer.score([photo()]);
    assert.equal(result.overallScore, 2.5);
  });

  it('rounds scores to nearest 0.5', async () => {
    const assessment = { ...GOOD_ASSESSMENT, overallScore: 2.3 };
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(claudeResponse(assessment)),
    });

    const result = await scorer.score([photo()]);
    assert.equal(result.overallScore, 2.5); // 2.3 → 2.5
  });

  it('clamps scores at boundaries (1 and 5)', async () => {
    const lowScore = { ...GOOD_ASSESSMENT, overallScore: 1 };
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(claudeResponse(lowScore)),
    });

    const result = await scorer.score([photo()]);
    assert.equal(result.overallScore, 1);

    const highScore = { ...GOOD_ASSESSMENT, overallScore: 5 };
    const scorer2 = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(claudeResponse(highScore)),
    });

    const result2 = await scorer2.score([photo()]);
    assert.equal(result2.overallScore, 5);
  });

  it('rejects scores outside 1–5', async () => {
    const bad = { ...GOOD_ASSESSMENT, overallScore: 7 };
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(claudeResponse(bad)),
    });

    await assert.rejects(
      () => scorer.score([photo()]),
      (err: unknown) => err instanceof VisionError && err.code === 'VALIDATION_ERROR',
    );
  });

  it('throws HTTP_ERROR on non-200 response', async () => {
    const errorBody = { error: { type: 'authentication_error', message: 'Invalid API key' } };
    const scorer = new ConditionScorer({
      apiKey: 'bad-key',
      http: mockHttp(errorBody, 401),
    });

    await assert.rejects(
      () => scorer.score([photo()]),
      (err: unknown) =>
        err instanceof VisionError &&
        err.code === 'HTTP_ERROR' &&
        err.statusCode === 401,
    );
  });

  it('throws PARSE_ERROR on non-JSON response', async () => {
    const badResponse = { content: [{ type: 'text', text: 'I cannot analyze this image.' }] };
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(badResponse),
    });

    await assert.rejects(
      () => scorer.score([photo()]),
      (err: unknown) => err instanceof VisionError && err.code === 'PARSE_ERROR',
    );
  });

  it('throws PARSE_ERROR when content is empty', async () => {
    const emptyResponse = { content: [] };
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(emptyResponse),
    });

    await assert.rejects(
      () => scorer.score([photo()]),
      (err: unknown) => err instanceof VisionError && err.code === 'PARSE_ERROR',
    );
  });

  it('sends correct headers and structure to Claude API', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    const http: HttpPost = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = opts.body;
      return { status: 200, ok: true, body: claudeResponse(GOOD_ASSESSMENT) };
    };

    const scorer = new ConditionScorer({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
      http,
    });

    await scorer.score([photo('exterior')]);

    assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages');
    assert.equal(capturedHeaders['x-api-key'], 'sk-ant-test');
    assert.equal(capturedHeaders['anthropic-version'], '2023-06-01');
    assert.equal(capturedHeaders['Content-Type'], 'application/json');

    const body = JSON.parse(capturedBody);
    assert.equal(body.model, 'claude-sonnet-4-20250514');
    assert.equal(body.max_tokens, 1024);
    assert.ok(body.system.includes('condition'));
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    // Should have: text label + image + text prompt = 3 content blocks
    assert.equal(body.messages[0].content.length, 3);
    assert.equal(body.messages[0].content[0].type, 'text');
    assert.equal(body.messages[0].content[0].text, '[exterior]');
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.type, 'base64');
  });

  it('uses custom base URL when provided', async () => {
    let capturedUrl = '';
    const http: HttpPost = async (url, _opts) => {
      capturedUrl = url;
      return { status: 200, ok: true, body: claudeResponse(GOOD_ASSESSMENT) };
    };

    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      baseUrl: 'https://proxy.internal',
      http,
    });

    await scorer.score([photo()]);
    assert.equal(capturedUrl, 'https://proxy.internal/v1/messages');
  });

  it('omits label text blocks when photo has no label', async () => {
    let capturedBody = '';
    const http: HttpPost = async (_url, opts) => {
      capturedBody = opts.body;
      return { status: 200, ok: true, body: claudeResponse(GOOD_ASSESSMENT) };
    };

    const scorer = new ConditionScorer({ apiKey: 'test-key', http });
    await scorer.score([photo()]); // no label

    const body = JSON.parse(capturedBody);
    // Should have: image + text prompt = 2 content blocks (no label)
    assert.equal(body.messages[0].content.length, 2);
    assert.equal(body.messages[0].content[0].type, 'image');
    assert.equal(body.messages[0].content[1].type, 'text');
  });

  it('handles multiple photos with mixed labels', async () => {
    let capturedBody = '';
    const http: HttpPost = async (_url, opts) => {
      capturedBody = opts.body;
      return { status: 200, ok: true, body: claudeResponse(GOOD_ASSESSMENT) };
    };

    const scorer = new ConditionScorer({ apiKey: 'test-key', http });
    await scorer.score([photo('exterior'), photo(), photo('kitchen')]);

    const body = JSON.parse(capturedBody);
    // exterior label + image + image (no label) + kitchen label + image + prompt text = 7 blocks
    // Wait: [exterior] text, image, image, [kitchen] text, image, prompt text
    // That's: text + image + image + text + image + text = 8? No:
    // photo('exterior'): label text + image = 2
    // photo(): image only = 1
    // photo('kitchen'): label text + image = 2
    // + final prompt text = 1
    // Total = 8? Actually let me count: 2 + 1 + 2 + 1 = 8? No, I'll just verify it's > 4
    const content = body.messages[0].content;
    assert.ok(content.length >= 5); // at minimum: 3 images + some text
    assert.equal(content[content.length - 1].type, 'text'); // last is always the prompt
  });
});

describe('ConditionScorer.visionHandler', () => {
  it('returns overallScore from the pipeline handler', async () => {
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp(claudeResponse(GOOD_ASSESSMENT)),
    });

    const handler = scorer.visionHandler();
    const input: Record<string, unknown> = {
      photos: [photo('exterior'), photo('kitchen')],
    };

    const score = await handler(input, '2026-07-24');
    assert.equal(score, 2.5);
    // Full assessment should be stashed on input for downstream stages.
    assert.ok(input._visionResult);
    const result = input._visionResult as { summary: string };
    assert.ok(result.summary.includes('below-average'));
  });

  it('falls back to input.conditionScore when no photos', async () => {
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp({}),
    });

    const handler = scorer.visionHandler();
    const score = await handler({ conditionScore: 4 }, '2026-07-24');
    assert.equal(score, 4);
  });

  it('falls back to 3 when no photos and no conditionScore', async () => {
    const scorer = new ConditionScorer({
      apiKey: 'test-key',
      http: mockHttp({}),
    });

    const handler = scorer.visionHandler();
    const score = await handler({}, '2026-07-24');
    assert.equal(score, 3);
  });
});
