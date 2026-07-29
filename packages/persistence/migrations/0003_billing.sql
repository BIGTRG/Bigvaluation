-- ValueProof — 0003: Stripe billing state (§5)
BEGIN;

CREATE TABLE IF NOT EXISTS billing_accounts (
  account_id           TEXT PRIMARY KEY,
  plan                 TEXT NOT NULL DEFAULT 'payg',
  stripe_customer_id   TEXT,
  subscription_id      TEXT,
  subscription_status  TEXT,
  updated_at           BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing_accounts(stripe_customer_id);

COMMIT;
