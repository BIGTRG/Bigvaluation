/**
 * ValueProof — Orchestration
 * Job & pipeline types (§7). A Job moves through a DAG of stages
 * (Capture → Understand → Value → Visualize → Deliver); independent stages run
 * in parallel; each stage retries on failure; events fire as it progresses.
 */

export type StageName = 'capture' | 'understand' | 'value' | 'visualize' | 'deliver';

export const STAGE_ORDER: readonly StageName[] = [
  'capture',
  'understand',
  'value',
  'visualize',
  'deliver',
];

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type StageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

/** Whatever the caller needs to start a report job. Loosely typed on purpose —
 *  stage handlers read what they need and ignore the rest. */
export interface JobInput {
  /** Subject query for the data hub (address / apn / lat-lng). */
  subject: Record<string, unknown>;
  /** Condition score if capture/understand is skipped (e.g. desk valuation). */
  conditionScore?: number;
  deal?: Record<string, unknown>;
  rental?: Record<string, unknown>;
  /** ISO "as of" date; defaults to job creation date. */
  asOf?: string;
  /** Report metadata (reportId, certification, etc.). */
  report?: Record<string, unknown>;
  /** Arbitrary extra input for custom stage handlers. */
  [key: string]: unknown;
}

export interface StageState {
  name: StageName;
  status: StageStatus;
  attempts: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

/**
 * Artifacts accumulated across stages. Each handler returns a partial that is
 * merged in, so later stages read earlier outputs (e.g. deliver reads
 * `valuation` and `renders`). Kept as a bag so the orchestrator stays generic.
 */
export interface JobContext {
  assembledData?: unknown;
  conditionScore?: number;
  valuation?: unknown;
  renders?: unknown;
  reportHtml?: string;
  reportUrl?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  input: JobInput;
  stages: Record<StageName, StageState>;
  context: JobContext;
  error?: string;
}

// --- Events (§9 webhook surface) -------------------------------------------

export type JobEventType =
  | 'job.started'
  | 'job.completed'
  | 'job.failed'
  | 'stage.started'
  | 'stage.succeeded'
  | 'stage.retrying'
  | 'stage.failed'
  | 'valuation.completed'
  | 'valuation.updated'
  | 'report.ready'
  | 'watch.changed';

export interface JobEvent {
  type: JobEventType;
  jobId: string;
  at: number;
  stage?: StageName;
  /** Small, serializable payload — never the full media, just references/values. */
  data?: Record<string, unknown>;
}

// --- Stage handler contract ------------------------------------------------

export interface StageContext {
  job: Readonly<Job>;
  input: JobInput;
  /** Accumulated artifacts from prior stages. */
  context: Readonly<JobContext>;
  /** Current attempt (1-based). */
  attempt: number;
  asOf: string;
  log: (msg: string) => void;
}

/** A stage handler returns the artifacts it produced (merged into JobContext). */
export type StageHandler = (ctx: StageContext) => Promise<Partial<JobContext>>;

export interface StageDefinition {
  name: StageName;
  /** Stages that must succeed before this one runs. */
  dependsOn: StageName[];
  handler: StageHandler;
  /** Total attempts allowed (1 = no retry). Default from orchestrator config. */
  maxAttempts?: number;
  /** If true, a failure here fails the job; if false, the stage is skipped and
   *  the pipeline continues (e.g. renders are nice-to-have). */
  required?: boolean;
}
