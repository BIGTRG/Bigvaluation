/**
 * {{BRAND_NAME}} — Vision (§4.1)
 * AI condition scoring from property photos.
 *
 * Usage:
 *   import { ConditionScorer, VisionError } from '@bigvaluation/vision';
 *
 *   const scorer = new ConditionScorer({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *   const assessment = await scorer.score(photos);
 *   // assessment.overallScore → feeds the valuation engine
 *   // assessment.summary → feeds the report builder
 *
 * Pipeline integration (server/buildApp.ts):
 *   const scorer = new ConditionScorer({ apiKey: cfg.anthropicApiKey! });
 *   const stages = buildDefaultStages({ hub, vision: scorer.visionHandler() });
 */

export { ConditionScorer, VisionError } from './scorer.ts';
export type {
  PropertyPhoto,
  ConditionAssessment,
  DimensionAssessment,
  VisionConfig,
  HttpPost,
} from './types.ts';
export { CONDITION_SCORING_SYSTEM_PROMPT, CONDITION_SCORING_USER_PROMPT } from './prompt.ts';
