-- {{BRAND_NAME}} — 0004: Material Intelligence (§4.3 add-on)
BEGIN;

-- Analyst runs: actual materials in, true finish tier + explained ARV out.
CREATE TABLE IF NOT EXISTS material_analyses (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  valuation_id  TEXT,
  subject       JSONB,
  materials     JSONB NOT NULL,
  analysis      JSONB NOT NULL,
  source        TEXT NOT NULL DEFAULT 'builder',
  attestation   JSONB,
  created_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_material_analyses_account ON material_analyses(account_id, created_at DESC);

-- Send-a-link SOW requests the borrower fills without an account.
CREATE TABLE IF NOT EXISTS material_links (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  account_id    TEXT NOT NULL,
  valuation_id  TEXT,
  subject       JSONB,
  url           TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  attestation   JSONB,
  analysis_id   TEXT,
  created_at    BIGINT NOT NULL,
  submitted_at  BIGINT
);
CREATE INDEX IF NOT EXISTS idx_material_links_account ON material_links(account_id, created_at DESC);

COMMIT;
