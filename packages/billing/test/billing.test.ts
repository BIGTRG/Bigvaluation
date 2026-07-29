import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StripeClient, verifyStripeWebhook, signStripePayload } from '../src/stripe.ts';
import { BillingService, InMemoryBillingStore } from '../src/service.ts';

function makeStripe(responses: Record<string, unknown>[] = [{ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' }]) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body)) });
    return new Response(JSON.stringify(responses[Math.min(i++, responses.length - 1)]), { status: 200 });
  }) as typeof fetch;
  return { stripe: new StripeClient({ secretKey: 'sk_test_x', fetchImpl }), calls };
}

function makeService(stripe: StripeClient, store = new InMemoryBillingStore()) {
  return {
    store,
    svc: new BillingService({
      stripe,
      store,
      prices: { report: 'price_report', proMonthly: 'price_pro' },
      successUrl: 'https://app.example.com/billing/success',
      cancelUrl: 'https://app.example.com/billing/cancel',
      clock: { now: () => 5000 },
    }),
  };
}

test('report checkout maps to a payment-mode session with the account round-tripped', async () => {
  const { stripe, calls } = makeStripe();
  const { svc } = makeService(stripe);
  const session = await svc.createReportCheckout('acct_1', 2);
  assert.equal(session.url, 'https://checkout.stripe.com/cs_1');
  assert.match(calls[0].url, /\/v1\/checkout\/sessions$/);
  assert.equal(calls[0].body.get('mode'), 'payment');
  assert.equal(calls[0].body.get('line_items[0][price]'), 'price_report');
  assert.equal(calls[0].body.get('line_items[0][quantity]'), '2');
  assert.equal(calls[0].body.get('metadata[account_id]'), 'acct_1');
});

test('pro checkout is subscription mode and tags the subscription metadata', async () => {
  const { stripe, calls } = makeStripe();
  const { svc } = makeService(stripe);
  await svc.createProCheckout('acct_2');
  assert.equal(calls[0].body.get('mode'), 'subscription');
  assert.equal(calls[0].body.get('line_items[0][price]'), 'price_pro');
  assert.equal(calls[0].body.get('subscription_data[metadata][account_id]'), 'acct_2');
});

test('checkout.session.completed upgrades a subscription buyer to pro and stores the customer', async () => {
  const { stripe } = makeStripe();
  const { svc, store } = makeService(stripe);
  const out = await svc.handleEvent({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', customer: 'cus_9', subscription: 'sub_9', metadata: { account_id: 'acct_3' } } },
  });
  assert.deepEqual(out, { handled: true, accountId: 'acct_3', plan: 'pro' });
  const a = await store.get('acct_3');
  assert.equal(a?.stripeCustomerId, 'cus_9');
  assert.equal(a?.subscriptionId, 'sub_9');
});

test('payment-mode checkout keeps the buyer on payg but links the customer', async () => {
  const { stripe } = makeStripe();
  const { svc, store } = makeService(stripe);
  const out = await svc.handleEvent({
    type: 'checkout.session.completed',
    data: { object: { mode: 'payment', customer: 'cus_1', client_reference_id: 'acct_4' } },
  });
  assert.equal(out.plan, 'payg');
  assert.equal((await store.get('acct_4'))?.stripeCustomerId, 'cus_1');
});

test('subscription lifecycle: canceled drops to payg, past_due keeps pro', async () => {
  const { stripe } = makeStripe();
  const { svc, store } = makeService(stripe);
  const sub = (status: string) => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status, metadata: { account_id: 'acct_5' } } },
  });
  await svc.handleEvent(sub('active'));
  assert.equal((await store.get('acct_5'))?.plan, 'pro');
  await svc.handleEvent(sub('past_due'));
  assert.equal((await store.get('acct_5'))?.plan, 'pro');
  await svc.handleEvent(sub('canceled'));
  assert.equal((await store.get('acct_5'))?.plan, 'payg');
});

test('unknown events are ignored', async () => {
  const { stripe } = makeStripe();
  const { svc } = makeService(stripe);
  const out = await svc.handleEvent({ type: 'invoice.finalized', data: { object: {} } });
  assert.deepEqual(out, { handled: false });
});

test('webhook verification accepts a valid signature and rejects tampering', () => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } });
  const header = signStripePayload(payload, 'whsec_x', 1_000_000_000_000);
  const event = verifyStripeWebhook(payload, header, 'whsec_x', { now: () => 1_000_000_000_000 });
  assert.equal(event.type, 'checkout.session.completed');
  assert.throws(() => verifyStripeWebhook(payload + ' ', header, 'whsec_x', { now: () => 1_000_000_000_000 }), /signature mismatch/);
  assert.throws(() => verifyStripeWebhook(payload, header, 'whsec_other', { now: () => 1_000_000_000_000 }), /signature mismatch/);
});

test('webhook verification rejects stale timestamps', () => {
  const payload = '{}';
  const header = signStripePayload(payload, 'whsec_x', 1_000_000_000_000);
  assert.throws(
    () => verifyStripeWebhook(payload, header, 'whsec_x', { now: () => 1_000_000_000_000 + 10 * 60 * 1000 }),
    /tolerance/,
  );
});

test('stripe errors surface with the vendor message', async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: 'No such price: price_x' } }), { status: 400 })) as typeof fetch;
  const stripe = new StripeClient({ secretKey: 'sk', fetchImpl });
  const { svc } = makeService(stripe);
  await assert.rejects(() => svc.createReportCheckout('acct'), /No such price/);
});
