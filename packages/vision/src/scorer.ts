/**
 * {{BRAND_NAME}} — Vision (§4.1)
 * Claude-based condition scorer. Sends property photos to Claude's vision API
 * and returns a structured ConditionAssessment. HTTP is injected for testability.
 *
 * Design notes:
 * - Uses Claude Messages API with image content blocks (base64).
 * - Requests raw JSON (no markdown) via the system prompt.
 * - Falls back gracefully: if Claude returns malformed JSON or an unexpected
 *   shape, throws a typed VisionError so the pipeline can degrade to a manual
 *   score (or default 3).
 * - No dependency on the Anthropic SDK — just HTTP POST. Keeps the package
 *   zero-dep like the rest of the monorepo.
 */

import type {
  PropertyPhoto,
  ConditionAssessment,
  DimensionAssessment,
  VisionConfig,
  HttpPost,
} from './types.ts';
import {
  CONDITION_SCORING_SYSTEM_PROMPT,
  CONDITION_SCORING_USER_PROMPT,
} from './prompt.ts';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_BASE = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 1024;
const API_VERSION = '2023-06-01';

export class VisionError extends Error {
  readonly code: 'HTTP_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'NO_PHOTOS';
  readonly statusCode?: number;

  constructor(
    message: string,
    code: 'HTTP_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'NO_PHOTOS',
    statusCode?: number,
  ) {
    super(message);
    this.name = 'VisionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Default HTTP POST using global fetch. */
async function defaultHttpPost(
  url: string,
  opts: { headers: Record<string, string>; body: string },
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: opts.headers,
    body: opts.body,
  });
  const body = await res.json();
  return { status: res.status, ok: res.ok, body };
}

export class ConditionScorer {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly http: HttpPost;
  private readonly maxTokens: number;

  constructor(cfg: VisionConfig) {
    if (!cfg.apiKey) throw new VisionError('apiKey is required', 'VALIDATION_ERROR');
    this.apiKey = cfg.apiKey;
    this.model = cfg.model ?? DEFAULT_MODEL;
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE;
    this.http = cfg.http ?? defaultHttpPost;
    this.maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  /**
   * Score property condition from one or more photos.
   * Throws VisionError on failure; the pipeline should catch and degrade.
   */
  async score(photos: PropertyPhoto[]): Promise<ConditionAssessment> {
    if (photos.length === 0) {
      throw new VisionError('At least one photo is required', 'NO_PHOTOS');
    }

    const content = this.buildContent(photos);
    const requestBody = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: CONDITION_SCORING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    };

    const res = await this.http(`${this.baseUrl}/v1/messages`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const msg =
        typeof res.body === 'object' && res.body !== null && 'error' in res.body
          ? JSON.stringify((res.body as Record<string, unknown>).error)
          : `HTTP ${res.status}`;
      throw new VisionError(`Claude API error: ${msg}`, 'HTTP_ERROR', res.status);
    }

    return this.parseResponse(res.body, photos.length);
  }

  /**
   * Convenience wrapper matching the PipelineDeps.vision signature:
   *   (input: Record<string, unknown>, asOf: string) => Promise<number>
   *
   * Extracts photos from input.photos (PropertyPhoto[]) and returns just
   * the overallScore number. Attach the full assessment to input._visionResult
   * for downstream stages (report builder can use the summary + dimensions).
   */
  visionHandler(): (input: Record<string, unknown>, asOf: string) => Promise<number> {
    return async (input: Record<string, unknown>, _asOf: string): Promise<number> => {
      const photos = input.photos as PropertyPhoto[] | undefined;
      if (!photos || photos.length === 0) {
        // No photos → fall back to manual score or default.
        return (input.conditionScore as number | undefined) ?? 3;
      }
      const assessment = await this.score(photos);
      // Stash the full result so the report builder can use the summary.
      input._visionResult = assessment;
      return assessment.overallScore;
    };
  }

  private buildContent(
    photos: PropertyPhoto[],
  ): Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> {
    const content: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    > = [];

    for (const photo of photos) {
      if (photo.label) {
        content.push({ type: 'text', text: `[${photo.label}]` });
      }
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: photo.mediaType,
          data: photo.data,
        },
      });
    }

    content.push({ type: 'text', text: CONDITION_SCORING_USER_PROMPT });
    return content;
  }

  private parseResponse(body: unknown, photoCount: number): ConditionAssessment {
    // Extract text from Claude Messages API response.
    const resBody = body as { content?: Array<{ type: string; text?: string }> };
    const textBlock = resBody?.content?.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      throw new VisionError('No text content in Claude response', 'PARSE_ERROR');
    }

    // Claude sometimes wraps JSON in markdown code fences despite instruction.
    let jsonStr = textBlock.text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new VisionError(`Failed to parse Claude JSON: ${jsonStr.slice(0, 200)}`, 'PARSE_ERROR');
    }

    return this.validateAssessment(parsed, photoCount);
  }

  private validateAssessment(raw: unknown, photoCount: number): ConditionAssessment {
    if (typeof raw !== 'object' || raw === null) {
      throw new VisionError('Assessment is not an object', 'VALIDATION_ERROR');
    }
    const obj = raw as Record<string, unknown>;

    const overallScore = this.validateScore(obj.overallScore, 'overallScore');

    const dimensions: DimensionAssessment[] = [];
    if (Array.isArray(obj.dimensions)) {
      for (const dim of obj.dimensions) {
        if (typeof dim !== 'object' || dim === null) continue;
        const d = dim as Record<string, unknown>;
        if (typeof d.dimension !== 'string') continue;
        dimensions.push({
          dimension: d.dimension,
          score: this.validateScore(d.score, `dimension.${d.dimension}`),
          reasoning: typeof d.reasoning === 'string' ? d.reasoning : '',
        });
      }
    }

    const summary = typeof obj.summary === 'string' ? obj.summary : '';

    return {
      overallScore,
      dimensions,
      summary,
      photosAnalyzed: photoCount,
      model: this.model,
    };
  }

  private validateScore(v: unknown, label: string): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      throw new VisionError(
        `Invalid score for ${label}: ${v} (expected 1–5)`,
        'VALIDATION_ERROR',
      );
    }
    // Round to nearest 0.5 to stay within the engine's expected range.
    return Math.round(n * 2) / 2;
  }
}
