/**
 * {{BRAND_NAME}} — Orchestration
 * The pipeline runner (§7). Executes a Job through its stage DAG:
 *   - a stage runs once all its dependencies have succeeded (or been skipped)
 *   - independent ready stages run in parallel
 *   - each stage retries up to maxAttempts with backoff
 *   - required-stage failure fails the job; optional-stage failure skips it
 *   - events fire throughout (incl. §9 valuation.completed / report.ready)
 *
 * Clock, sleep, and id generation are injectable so runs are deterministic in
 * tests. In production they default to the real wall clock and crypto UUIDs.
 */

import type {
  Job,
  JobInput,
  JobEvent,
  JobEventType,
  StageDefinition,
  StageName,
  StageState,
  StageContext,
} from './types.ts';
import { STAGE_ORDER } from './types.ts';
import type { JobStore } from './store.ts';
import type { EventBus } from './events.ts';

export interface OrchestratorOptions {
  store: JobStore;
  events: EventBus;
  stages: StageDefinition[];
  defaultMaxAttempts?: number;
  /** Backoff before retry attempt N (1-based retry index). Default 0 in tests. */
  backoffMs?: (retryIndex: number) => number;
  clock?: { now: () => number };
  sleep?: (ms: number) => Promise<void>;
  idFactory?: () => string;
  /** Max stages to run concurrently. Default: unbounded (the DAG is small). */
  concurrency?: number;
}

export class Orchestrator {
  private readonly store: JobStore;
  private readonly events: EventBus;
  private readonly stages: Map<StageName, StageDefinition>;
  private readonly order: StageName[];
  private readonly defaultMaxAttempts: number;
  private readonly backoffMs: (n: number) => number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly idFactory: () => string;
  private readonly concurrency: number;

  constructor(opts: OrchestratorOptions) {
    this.store = opts.store;
    this.events = opts.events;
    this.stages = new Map(opts.stages.map((s) => [s.name, s]));
    this.order = opts.stages.map((s) => s.name);
    this.defaultMaxAttempts = opts.defaultMaxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? (() => 0);
    this.now = opts.clock?.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.idFactory = opts.idFactory ?? (() => `job_${cryptoId()}`);
    this.concurrency = Math.max(1, opts.concurrency ?? Number.MAX_SAFE_INTEGER);
    this.validateDag();
  }

  /** Create + persist a queued job with every stage pending. */
  async createJob(input: JobInput): Promise<Job> {
    const t = this.now();
    const stages = {} as Record<StageName, StageState>;
    for (const name of this.order) {
      stages[name] = { name, status: 'pending', attempts: 0 };
    }
    const job: Job = {
      id: this.idFactory(),
      status: 'queued',
      createdAt: t,
      updatedAt: t,
      input,
      stages,
      context: {},
    };
    await this.store.save(job);
    return job;
  }

  /** Run a job to completion (or failure). Returns the final job. */
  async runJob(jobId: string): Promise<Job> {
    const job = await this.store.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status === 'completed' || job.status === 'failed') return job;

    job.status = 'running';
    await this.persist(job);
    await this.emit(job, 'job.started');

    const asOf = job.input.asOf ?? new Date(this.now()).toISOString().slice(0, 10);

    while (true) {
      const ready = this.readyStages(job);
      if (ready.length === 0) break;

      const batch = ready.slice(0, this.concurrency);
      await Promise.all(batch.map((name) => this.runStage(job, name, asOf)));

      if (job.status === 'failed') break;
    }

    if (job.status !== 'failed') {
      const anyRequiredUnfinished = this.order.some((n) => {
        const def = this.stages.get(n)!;
        return (def.required ?? true) && job.stages[n].status !== 'succeeded';
      });
      if (anyRequiredUnfinished) {
        job.status = 'failed';
        job.error = job.error ?? 'A required stage did not complete.';
        await this.persist(job);
        await this.emit(job, 'job.failed');
      } else {
        job.status = 'completed';
        await this.persist(job);
        await this.emit(job, 'job.completed');
      }
    }
    return job;
  }

  /** Create, enqueue-free convenience: create then immediately run. */
  async submit(input: JobInput): Promise<Job> {
    const job = await this.createJob(input);
    return this.runJob(job.id);
  }

  // --- internals -----------------------------------------------------------

  private readyStages(job: Job): StageName[] {
    const ready: StageName[] = [];
    for (const name of this.order) {
      const st = job.stages[name];
      if (st.status !== 'pending') continue;
      const def = this.stages.get(name)!;
      const depsDone = def.dependsOn.every((d) => {
        const ds = job.stages[d].status;
        return ds === 'succeeded' || ds === 'skipped';
      });
      if (depsDone) ready.push(name);
    }
    return ready;
  }

  private async runStage(job: Job, name: StageName, asOf: string): Promise<void> {
    const def = this.stages.get(name)!;
    const maxAttempts = def.maxAttempts ?? this.defaultMaxAttempts;
    const st = job.stages[name];
    st.status = 'running';
    st.startedAt = this.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      st.attempts = attempt;
      await this.emit(job, attempt === 1 ? 'stage.started' : 'stage.retrying', name);
      const ctx: StageContext = {
        job,
        input: job.input,
        context: job.context,
        attempt,
        asOf,
        log: () => {},
      };
      try {
        const produced = await def.handler(ctx);
        job.context = { ...job.context, ...produced };
        st.status = 'succeeded';
        st.finishedAt = this.now();
        st.error = undefined;
        await this.emit(job, 'stage.succeeded', name);
        await this.emitStageMilestones(job, name);
        return;
      } catch (err) {
        st.error = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        // Exhausted retries.
        st.finishedAt = this.now();
        const required = def.required ?? true;
        if (required) {
          st.status = 'failed';
          job.status = 'failed';
          job.error = `Stage "${name}" failed: ${st.error}`;
          await this.emit(job, 'stage.failed', name);
          await this.emit(job, 'job.failed');
        } else {
          st.status = 'skipped';
          await this.emit(job, 'stage.failed', name);
        }
        return;
      }
    }
  }

  /** Fire the §9 domain events tied to specific stages completing. */
  private async emitStageMilestones(job: Job, name: StageName): Promise<void> {
    if (name === 'value' && job.context.valuation) {
      const v = job.context.valuation as { asIs?: number; arv?: unknown };
      await this.emit(job, 'valuation.completed', name, { asIs: v.asIs, arv: v.arv });
    }
    if (name === 'deliver') {
      await this.emit(job, 'report.ready', name, {
        reportUrl: job.context.reportUrl,
        hasHtml: typeof job.context.reportHtml === 'string',
      });
    }
  }

  private async persist(job: Job): Promise<void> {
    job.updatedAt = this.now();
    await this.store.save(job);
  }

  private async emit(
    job: Job,
    type: JobEventType,
    stage?: StageName,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.persist(job);
    const event: JobEvent = { type, jobId: job.id, at: this.now(), stage, data };
    await this.events.emit(event);
  }

  private validateDag(): void {
    for (const def of this.stages.values()) {
      for (const dep of def.dependsOn) {
        if (!this.stages.has(dep)) {
          throw new Error(`Stage "${def.name}" depends on unknown stage "${dep}"`);
        }
      }
    }
    // Cheap cycle check via topological reduction.
    const remaining = new Set(this.stages.keys());
    let progressed = true;
    while (remaining.size > 0 && progressed) {
      progressed = false;
      for (const name of [...remaining]) {
        const def = this.stages.get(name)!;
        if (def.dependsOn.every((d) => !remaining.has(d))) {
          remaining.delete(name);
          progressed = true;
        }
      }
    }
    if (remaining.size > 0) {
      throw new Error(`Stage DAG has a cycle involving: ${[...remaining].join(', ')}`);
    }
  }
}

function cryptoId(): string {
  // crypto.randomUUID is available in Node ≥ 16.7 without imports.
  try {
    return (globalThis.crypto as Crypto).randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    // Should never hit in supported Node; deterministic fallback (no RNG).
    return 'id' + Date.now().toString(36);
  }
}
