/**
 * {{BRAND_NAME}} — Orchestration
 * Job persistence + queue interfaces, with in-memory defaults. Swap for Postgres
 * (store) and a real broker (queue) in production — the orchestrator only sees
 * these interfaces (§6 adapter rule).
 */

import type { Job } from './types.ts';

export interface JobStore {
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  list(): Promise<Job[]>;
  /** Jobs owned by one account, newest first (dashboard/list endpoints). */
  listByAccount(accountId: string, limit?: number): Promise<Job[]>;
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    // Store a structural clone so callers can't mutate persisted state.
    this.jobs.set(job.id, structuredClone(job));
  }
  async get(id: string): Promise<Job | null> {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }
  async list(): Promise<Job[]> {
    return [...this.jobs.values()].map((j) => structuredClone(j));
  }
  async listByAccount(accountId: string, limit = 50): Promise<Job[]> {
    return [...this.jobs.values()]
      .filter((j) => (j.input as { accountId?: unknown }).accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((j) => structuredClone(j));
  }
}

/** A minimal FIFO job queue. Production: SQS/Redis/pg-boss behind this. */
export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
  /** Returns the next job id, or null if empty. */
  dequeue(): Promise<string | null>;
  size(): Promise<number>;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly q: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.q.push(jobId);
  }
  async dequeue(): Promise<string | null> {
    return this.q.shift() ?? null;
  }
  async size(): Promise<number> {
    return this.q.length;
  }
}
