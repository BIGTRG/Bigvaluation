/**
 * {{BRAND_NAME}} — BillingService (§5 monetization)
 * Maps the three membership tiers to Stripe products and keeps account plans
 * in sync from webhook events:
 *   - payg:    pay-per-report Checkout (mode=payment)
 *   - pro:     monthly membership Checkout (mode=subscription); reports discounted
 *   - partner: contract/metered — provisioned out of band, never via Checkout
 * The API's MeterStore already records usage per account; partner invoicing
 * reads from it.
 */

import type { CheckoutSession, StripeClient } from './stripe.ts';

export type BillingPlan = 'payg' | 'pro' | 'partner';

export interface BillingAccount {
  accountId: string;
  plan: BillingPlan;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  updatedAt: number;
}

export interface BillingStore {
  get(accountId: string): Promise<BillingAccount | null>;
  save(account: BillingAccount): Promise<void>;
}

export interface BillingServiceOptions {
  stripe: StripeClient;
  store: BillingStore;
  /** Stripe price ids. */
  prices: { report: string; proMonthly: string };
  /** Where Checkout returns the buyer. */
  successUrl: string;
  cancelUrl: string;
  clock?: { now: () => number };
  log?: (msg: string) => void;
}

export interface WebhookOutcome {
  handled: boolean;
  accountId?: string;
  plan?: BillingPlan;
}

export class BillingService {
  private readonly o: BillingServiceOptions;
  private readonly now: () => number;

  constructor(opts: BillingServiceOptions) {
    this.o = opts;
    this.now = opts.clock?.now ?? (() => Date.now());
  }

  /** Pay-per-report checkout (§5.1). */
  async createReportCheckout(accountId: string, quantity = 1): Promise<CheckoutSession> {
    const existing = await this.o.store.get(accountId);
    return this.o.stripe.createCheckoutSession({
      mode: 'payment',
      priceId: this.o.prices.report,
      quantity,
      accountId,
      customerId: existing?.stripeCustomerId,
      successUrl: this.o.successUrl,
      cancelUrl: this.o.cancelUrl,
    });
  }

  /** Pro membership checkout (§5.2). */
  async createProCheckout(accountId: string): Promise<CheckoutSession> {
    const existing = await this.o.store.get(accountId);
    return this.o.stripe.createCheckoutSession({
      mode: 'subscription',
      priceId: this.o.prices.proMonthly,
      accountId,
      customerId: existing?.stripeCustomerId,
      successUrl: this.o.successUrl,
      cancelUrl: this.o.cancelUrl,
    });
  }

  /**
   * Apply a verified Stripe event to the account's billing state.
   * Idempotent: replaying an event converges to the same state.
   */
  async handleEvent(event: Record<string, unknown>): Promise<WebhookOutcome> {
    const type = String(event.type ?? '');
    const object = ((event.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;

    if (type === 'checkout.session.completed') {
      const accountId = extractAccountId(object);
      if (!accountId) return { handled: false };
      const account = (await this.o.store.get(accountId)) ?? this.blank(accountId);
      if (typeof object.customer === 'string') account.stripeCustomerId = object.customer;
      if (object.mode === 'subscription') {
        account.plan = 'pro';
        if (typeof object.subscription === 'string') account.subscriptionId = object.subscription;
        account.subscriptionStatus = 'active';
      }
      account.updatedAt = this.now();
      await this.o.store.save(account);
      this.o.log?.(`billing: checkout completed for ${accountId} (${String(object.mode)})`);
      return { handled: true, accountId, plan: account.plan };
    }

    if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const accountId = extractAccountId(object);
      if (!accountId) return { handled: false };
      const account = (await this.o.store.get(accountId)) ?? this.blank(accountId);
      const status = String(object.status ?? (type.endsWith('deleted') ? 'canceled' : ''));
      account.subscriptionStatus = status;
      if (typeof object.id === 'string') account.subscriptionId = object.id;
      // Pro stays active through grace states; hard-ended subs drop to payg.
      account.plan = ['active', 'trialing', 'past_due'].includes(status) ? 'pro' : 'payg';
      account.updatedAt = this.now();
      await this.o.store.save(account);
      this.o.log?.(`billing: subscription ${status} for ${accountId} → ${account.plan}`);
      return { handled: true, accountId, plan: account.plan };
    }

    return { handled: false };
  }

  /** Current billing state for an account (payg default). */
  async getAccount(accountId: string): Promise<BillingAccount> {
    return (await this.o.store.get(accountId)) ?? this.blank(accountId);
  }

  private blank(accountId: string): BillingAccount {
    return { accountId, plan: 'payg', updatedAt: this.now() };
  }
}

function extractAccountId(object: Record<string, unknown>): string | undefined {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const fromMeta = metadata?.account_id;
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
  const fromRef = object.client_reference_id;
  if (typeof fromRef === 'string' && fromRef) return fromRef;
  return undefined;
}

/** In-memory store for dev/tests. */
export class InMemoryBillingStore implements BillingStore {
  private readonly byId = new Map<string, BillingAccount>();
  async get(accountId: string): Promise<BillingAccount | null> {
    const a = this.byId.get(accountId);
    return a ? { ...a } : null;
  }
  async save(account: BillingAccount): Promise<void> {
    this.byId.set(account.accountId, { ...account });
  }
}
