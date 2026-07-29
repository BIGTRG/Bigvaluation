/**
 * {{BRAND_NAME}} — Billing (§5)
 * Stripe connector + plan sync. Public surface.
 */

export { StripeClient, verifyStripeWebhook, signStripePayload } from './stripe.ts';
export type { StripeClientOptions, CheckoutSessionParams, CheckoutSession } from './stripe.ts';
export { BillingService, InMemoryBillingStore } from './service.ts';
export type { BillingPlan, BillingAccount, BillingStore, BillingServiceOptions, WebhookOutcome } from './service.ts';
