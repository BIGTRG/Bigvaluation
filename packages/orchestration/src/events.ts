/**
 * {{BRAND_NAME}} — Orchestration
 * Event bus + webhook dispatch (§9 webhooks). Subscribers receive every job
 * event; the WebhookDispatcher forwards a subset to registered HTTP endpoints.
 * A failing subscriber never breaks the pipeline or the other subscribers.
 */

import type { JobEvent, JobEventType } from './types.ts';

export type EventSubscriber = (event: JobEvent) => void | Promise<void>;

export class EventBus {
  private readonly subs: EventSubscriber[] = [];
  /** Every emitted event, for inspection/tests and an audit trail. */
  readonly log: JobEvent[] = [];

  subscribe(fn: EventSubscriber): () => void {
    this.subs.push(fn);
    return () => {
      const i = this.subs.indexOf(fn);
      if (i >= 0) this.subs.splice(i, 1);
    };
  }

  async emit(event: JobEvent): Promise<void> {
    this.log.push(event);
    // Isolate subscriber failures — one bad webhook can't halt the job.
    await Promise.all(
      this.subs.map(async (fn) => {
        try {
          await fn(event);
        } catch {
          /* swallow: delivery is best-effort; see WebhookDispatcher for retries */
        }
      }),
    );
  }
}

/** Injectable HTTP POST so webhook delivery is testable without network. */
export interface HttpPostResult {
  status: number;
  ok: boolean;
}
export type HttpPost = (
  url: string,
  body: unknown,
  headers?: Record<string, string>,
) => Promise<HttpPostResult>;

/** Default HttpPost backed by global fetch. */
export const fetchHttpPost: HttpPost = async (url, body, headers) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok };
};

export interface WebhookSubscription {
  url: string;
  /** Only these event types are delivered. Empty = all. */
  events?: JobEventType[];
  /** Optional secret for an HMAC-style header (caller supplies signing). */
  headers?: Record<string, string>;
}

export interface WebhookDispatcherOptions {
  http?: HttpPost;
  maxAttempts?: number;
}

/**
 * Forwards matching events to subscribed webhook URLs, with bounded retries.
 * Delivery attempts and outcomes are recorded for observability.
 */
export class WebhookDispatcher {
  private readonly http: HttpPost;
  private readonly maxAttempts: number;
  private readonly subscriptions: WebhookSubscription[] = [];
  readonly deliveries: { url: string; type: JobEventType; ok: boolean; attempts: number }[] = [];

  constructor(opts: WebhookDispatcherOptions = {}) {
    this.http = opts.http ?? fetchHttpPost;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  add(sub: WebhookSubscription): void {
    this.subscriptions.push(sub);
  }

  /** Use as an EventBus subscriber: `bus.subscribe(dispatcher.handler)`. */
  handler: EventSubscriber = async (event: JobEvent) => {
    for (const sub of this.subscriptions) {
      if (sub.events && sub.events.length > 0 && !sub.events.includes(event.type)) continue;
      await this.deliver(sub, event);
    }
  };

  private async deliver(sub: WebhookSubscription, event: JobEvent): Promise<void> {
    let attempts = 0;
    let ok = false;
    while (attempts < this.maxAttempts && !ok) {
      attempts++;
      try {
        const res = await this.http(sub.url, event, sub.headers);
        ok = res.ok;
      } catch {
        ok = false;
      }
    }
    this.deliveries.push({ url: sub.url, type: event.type, ok, attempts });
  }
}
