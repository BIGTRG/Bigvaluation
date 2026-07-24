# Vision — AI Condition Scoring (§4.1)

Analyzes property photos via Claude's vision API and returns a structured
**condition score (1–5)** that drives the valuation engine's As-Is multiplier.

## How it works

1. **Photos in** — JPEG/PNG/WebP images, optionally labeled (exterior, kitchen, etc.)
2. **Claude analyzes** — sends images + a tuned system prompt to Claude Sonnet
3. **Structured assessment out** — per-dimension scores + overall score + plain-language summary

```
Photos → ConditionScorer.score() → ConditionAssessment
                                      ├── overallScore (1–5)  → valuation engine
                                      ├── dimensions[]        → report detail
                                      └── summary             → report narrative
```

## Scoring scale

| Score | Meaning | Example |
|-------|---------|---------|
| 1 | Distressed / gut rehab | Fire damage, condemned, uninhabitable |
| 2 | Below average | Significant deferred maintenance, 20+ yr systems |
| 3 | Average / livable | Standard for age, minor wear, functional |
| 4 | Above average / updated | Recent partial reno, modern finishes in key areas |
| 5 | Turnkey / fully renovated | New or like-new, premium finishes, model-home |

Half-point increments (2.5, 3.5, etc.) are supported.

## Usage

```ts
import { ConditionScorer } from '@bigvaluation/vision';

const scorer = new ConditionScorer({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  // model: 'claude-sonnet-4-20250514',  // default
});

const assessment = await scorer.score([
  { data: base64JpegData, mediaType: 'image/jpeg', label: 'exterior_front' },
  { data: base64JpegData, mediaType: 'image/jpeg', label: 'kitchen' },
  { data: base64JpegData, mediaType: 'image/jpeg', label: 'bathroom' },
]);

console.log(assessment.overallScore);  // 2.5
console.log(assessment.summary);       // "Property is in below-average condition..."
```

## Pipeline integration

The scorer provides a `visionHandler()` that matches the orchestration pipeline's
`vision` slot signature:

```ts
// In server/buildApp.ts:
const scorer = new ConditionScorer({ apiKey: cfg.anthropicApiKey! });
const stages = buildDefaultStages({
  hub,
  vision: scorer.visionHandler(),
});
```

When no photos are provided, the handler gracefully falls back to
`input.conditionScore` or defaults to 3 (average).

## Testing

All tests use injected HTTP — no real API calls:

```bash
node --experimental-strip-types --test test/scorer.test.ts
```

## Design principles

- **Zero external dependencies** — uses `fetch()` directly, no Anthropic SDK
- **Injected HTTP** — fully testable with canned responses
- **Defensive parsing** — handles markdown-fenced JSON, validates score ranges
- **Graceful degradation** — throws typed `VisionError` so the pipeline can fall back
- **Prompt isolation** — scoring prompt lives in `prompt.ts` for independent tuning
