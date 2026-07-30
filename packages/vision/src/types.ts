/**
 * ValueProof — Vision (§4.1)
 * Types for the AI condition-scoring module.
 */

import type { ConditionScore } from '../../valuation-engine/src/types.ts';

/** A single captured photo of the property. */
export interface PropertyPhoto {
  /** Base64-encoded image data (JPEG/PNG/WebP). */
  data: string;
  /** MIME type: 'image/jpeg', 'image/png', 'image/webp'. */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Optional label: 'exterior_front', 'kitchen', 'bathroom', 'roof', etc. */
  label?: string;
}

/** Structured reasoning for a single assessment dimension. */
export interface DimensionAssessment {
  /** What was assessed: 'exterior', 'roof', 'kitchen', 'bathrooms', 'flooring', 'systems', 'overall'. */
  dimension: string;
  /** Score 1–5 for this dimension. */
  score: ConditionScore;
  /** One-sentence plain-English explanation. */
  reasoning: string;
}

/** One visible material read from the photos (siding, flooring, ...). */
export interface MaterialObservation {
  /** 'siding' | 'windows' | 'flooring' | 'paint' | 'trim' | 'countertops' | 'cabinets' | 'roofing'. */
  category: string;
  /** What was seen, e.g. 'vinyl siding, faded south face'. */
  observed: string;
  /** Quality grade: 'builder' | 'standard' | 'premium'. */
  grade?: string;
}

/** Full condition assessment returned by the Vision module. */
export interface ConditionAssessment {
  /** Overall condition score 1–5, drives the valuation engine's ConditionFactor. */
  overallScore: ConditionScore;
  /** Per-dimension breakdown. */
  dimensions: DimensionAssessment[];
  /** Visible materials read from the photos (drives renders + report). */
  materials?: MaterialObservation[];
  /** Plain-language summary for the report (2–3 sentences). */
  summary: string;
  /** Number of photos analyzed. */
  photosAnalyzed: number;
  /** Model used (e.g. 'claude-sonnet-4-20250514'). */
  model: string;
  /** Prompt tokens + completion tokens for cost tracking. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** Configuration for the Vision module. */
export interface VisionConfig {
  /** Anthropic API key. */
  apiKey: string;
  /** Model to use. Default: 'claude-sonnet-4-20250514'. Sonnet is optimal for vision+structured output. */
  model?: string;
  /** Base URL override for proxy/testing. */
  baseUrl?: string;
  /** HTTP POST function injection for testability. */
  http?: HttpPost;
  /** Max tokens for the response. Default: 1024. */
  maxTokens?: number;
}

/** Injectable HTTP POST for testing without real API calls. */
export type HttpPost = (
  url: string,
  opts: { headers: Record<string, string>; body: string },
) => Promise<{ status: number; ok: boolean; body: unknown }>;
