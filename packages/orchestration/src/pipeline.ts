/**
 * ValueProof — Orchestration
 * The default 5-stage pipeline, wiring the real packages as stage handlers:
 *
 *   capture   →  understand  →   value    →  visualize  →  deliver
 *  (media in)   (condition,    (data hub +   (AI renders,  (render the
 *               §4.1 Vision)   engine, §4.5)  optional)    report, §3)
 *
 * Vision, render, and publish are injected — pass real implementations in prod
 * (Claude condition scoring, a render API, MinIO upload) or omit them for a
 * desk valuation. This module is the composition root; the orchestrator itself
 * stays generic and package-agnostic.
 */

import type { StageDefinition } from './types.ts';
import { PropertyDataHub, toValuationRequest } from '../../connectors/src/index.ts';
import type { SubjectQuery } from '../../connectors/src/index.ts';
import { computeValuation } from '../../valuation-engine/src/index.ts';
import type { DealInputs, RentalInputs, Valuation } from '../../valuation-engine/src/index.ts';
import { renderReport } from '../../report-builder/src/index.ts';
import type { ReportMeta } from '../../report-builder/src/index.ts';

export interface PipelineDeps {
  hub: PropertyDataHub;
  /** Condition scoring (§4.1). Defaults to input.conditionScore, else 3 (average). */
  vision?: (input: Record<string, unknown>, asOf: string) => Promise<number>;
  /** Renders for a scope (§4.4). Optional; a failure only skips the images.
   *  `input` is the job input (photos, materials) for providers that need it. */
  render?: (valuation: Valuation, asOf: string, input?: Record<string, unknown>) => Promise<unknown>;
  /** Persist the report and return its URL (e.g. MinIO put → CDN url). */
  publish?: (jobId: string, html: string) => Promise<string>;
  /** Base report metadata; per-job overrides come from job.input.report. */
  reportDefaults?: Partial<ReportMeta>;
}

export function buildDefaultStages(deps: PipelineDeps): StageDefinition[] {
  return [
    {
      name: 'capture',
      dependsOn: [],
      // Media capture (§4.1) happens in the client web app; server-side this is
      // a checkpoint that succeeds once media (or a desk-valuation flag) exists.
      handler: async () => ({}),
    },
    {
      name: 'understand',
      dependsOn: ['capture'],
      handler: async (ctx) => {
        const existing =
          (ctx.context.conditionScore as number | undefined) ??
          (ctx.input.conditionScore as number | undefined);
        const score = existing ?? (deps.vision ? await deps.vision(ctx.input, ctx.asOf) : 3);
        return { conditionScore: score };
      },
    },
    {
      name: 'value',
      dependsOn: ['understand'],
      handler: async (ctx) => {
        const data = await deps.hub.assemble(ctx.input.subject as unknown as SubjectQuery, {
          asOf: ctx.asOf,
        });
        const conditionScore = (ctx.context.conditionScore as number | undefined) ?? 3;
        const request = toValuationRequest(data, conditionScore, {
          asOf: ctx.asOf,
          deal: ctx.input.deal as DealInputs | undefined,
          rental: ctx.input.rental as RentalInputs | undefined,
        });
        const valuation = computeValuation(request);
        return { assembledData: data, valuation };
      },
    },
    {
      name: 'visualize',
      dependsOn: ['value'],
      // Nice-to-have: if the render API is down, still deliver a report.
      required: false,
      handler: async (ctx) => {
        if (!deps.render) return {};
        const out = await deps.render(ctx.context.valuation as Valuation, ctx.asOf, ctx.input);
        // Renderers may return { renders, photoRenders } (per-photo all-tier
        // renders, §4.4) or the plain per-tier renders object (legacy shape).
        if (out && typeof out === 'object' && 'photoRenders' in (out as Record<string, unknown>)) {
          const o = out as { renders?: unknown; photoRenders?: unknown };
          return { renders: o.renders ?? {}, photoRenders: o.photoRenders };
        }
        return { renders: out };
      },
    },
    {
      name: 'deliver',
      dependsOn: ['value', 'visualize'],
      handler: async (ctx) => {
        const valuation = ctx.context.valuation as Valuation;
        if (!valuation) throw new Error('deliver: no valuation in context');
        const data = ctx.context.assembledData as { comps?: unknown } | undefined;
        const meta: ReportMeta = {
          reportId: `FM-${ctx.job.id}`,
          generatedAt: new Date(Date.parse(`${ctx.asOf}T12:00:00Z`)).toISOString(),
          certification: 'ai',
          ...deps.reportDefaults,
          ...(ctx.input.report as Partial<ReportMeta> | undefined),
        };
        // §4.4: renders produced by the visualize stage flow into the report.
        if (!meta.renders && ctx.context.renders && typeof ctx.context.renders === 'object') {
          meta.renders = ctx.context.renders as ReportMeta['renders'];
        }
        // §4.4: per-photo all-tier renders (before → Light / Medium / High).
        if (!meta.photoRenders && Array.isArray(ctx.context.photoRenders)) {
          meta.photoRenders = ctx.context.photoRenders as ReportMeta['photoRenders'];
        }
        // §4.1: the Vision materials read surfaces in the report.
        const visionResult = ctx.input._visionResult as { materials?: ReportMeta['materialsObserved'] } | undefined;
        if (!meta.materialsObserved && visionResult?.materials?.length) {
          meta.materialsObserved = visionResult.materials;
        }
        const html = renderReport({
          valuation,
          comps: (data?.comps as never) ?? undefined,
          meta,
        });
        const reportUrl = deps.publish ? await deps.publish(ctx.job.id, html) : undefined;
        return { reportHtml: html, reportUrl };
      },
    },
  ];
}
