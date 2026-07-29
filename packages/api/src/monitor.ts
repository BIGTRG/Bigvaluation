/**
 * ValueProof — Live valuation monitoring (§5.3)
 * Watched properties re-value automatically as comps/market shift. The
 * WatchMonitor ticks on a schedule (server wiring decides the cadence),
 * re-runs the valuation for each watch, and fires a `watch.changed` webhook
 * when the value moves beyond the change threshold.
 *
 * Dependencies are injected so the monitor is unit-testable without timers,
 * sockets, or a real pipeline.
 */

import type { Watch, WatchStore } from './types.ts';

export interface Revaluation {
  valuationId: string;
  asIs: number;
  /** Recommended ARV (medium tier unless the watch says otherwise). */
  arv: number;
}

export interface WatchChangedEvent {
  type: 'watch.changed';
  watchId: string;
  accountId: string;
  subject: Record<string, unknown>;
  previous: { asIs?: number; arv?: number; valuationId?: string };
  current: { asIs: number; arv: number; valuationId: string };
  /** Largest relative move across as-is and ARV, e.g. 0.031 = 3.1%. */
  changeDelta: number;
  at: number;
}

export type WatchNotifier = (url: string, event: WatchChangedEvent) => Promise<void>;

export interface WatchMonitorOptions {
  watches: WatchStore;
  /** Re-run a valuation for a watch; the server wires this to the orchestrator.
   *  The watch carries the recorded attestation, which the re-valuation reuses. */
  revalue: (watch: Watch) => Promise<Revaluation>;
  /** Deliver a watch.changed event (server wires this to the webhook transport). */
  notify: WatchNotifier;
  /** Relative move that counts as a change. Default 2%. */
  changeThreshold?: number;
  clock?: { now: () => number };
  log?: (msg: string) => void;
}

export interface TickResult {
  checked: number;
  changed: number;
  notified: number;
  failed: number;
}

export class WatchMonitor {
  private readonly opts: WatchMonitorOptions;
  private readonly threshold: number;
  private readonly now: () => number;

  constructor(opts: WatchMonitorOptions) {
    this.opts = opts;
    this.threshold = opts.changeThreshold ?? 0.02;
    this.now = opts.clock?.now ?? (() => Date.now());
  }

  /** Re-value every watch once. Errors on one watch never block the others. */
  async tick(): Promise<TickResult> {
    const watches = await this.opts.watches.listAll();
    const result: TickResult = { checked: 0, changed: 0, notified: 0, failed: 0 };
    for (const watch of watches) {
      try {
        const outcome = await this.checkOne(watch);
        result.checked++;
        if (outcome.changed) result.changed++;
        if (outcome.notified) result.notified++;
      } catch (err) {
        result.failed++;
        this.opts.log?.(`watch ${watch.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return result;
  }

  private async checkOne(watch: Watch): Promise<{ changed: boolean; notified: boolean }> {
    const t = this.now();
    const current = await this.opts.revalue(watch);

    const prevAsIs = watch.lastAsIs;
    const prevArv = watch.lastArv;
    const isFirstRun = prevAsIs === undefined && prevArv === undefined;
    const delta = isFirstRun ? 0 : maxRelativeDelta(prevAsIs, current.asIs, prevArv, current.arv);
    const changed = !isFirstRun && delta >= this.threshold;

    const event: WatchChangedEvent = {
      type: 'watch.changed',
      watchId: watch.id,
      accountId: watch.accountId,
      subject: watch.subject,
      previous: { asIs: prevAsIs, arv: prevArv, valuationId: watch.lastValuationId },
      current: { asIs: current.asIs, arv: current.arv, valuationId: current.valuationId },
      changeDelta: round4(delta),
      at: t,
    };

    let notified = false;
    if (changed && watch.webhookUrl) {
      await this.opts.notify(watch.webhookUrl, event);
      notified = true;
    }

    await this.opts.watches.save({
      ...watch,
      lastValuationId: current.valuationId,
      lastAsIs: current.asIs,
      lastArv: current.arv,
      lastCheckedAt: t,
      changeDelta: round4(delta),
      notifiedAt: notified ? t : watch.notifiedAt,
    });

    return { changed, notified };
  }
}

function maxRelativeDelta(prevAsIs: number | undefined, asIs: number, prevArv: number | undefined, arv: number): number {
  const deltas: number[] = [];
  if (prevAsIs !== undefined && prevAsIs > 0) deltas.push(Math.abs(asIs - prevAsIs) / prevAsIs);
  if (prevArv !== undefined && prevArv > 0) deltas.push(Math.abs(arv - prevArv) / prevArv);
  return deltas.length ? Math.max(...deltas) : 0;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
