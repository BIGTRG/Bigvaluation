-- ValueProof — Persistence (§8 data model)
-- Initial schema. Timestamps are stored as BIGINT epoch-milliseconds to match
-- the application's numeric clock (and keep runs reproducible with an injected
-- clock). JSONB holds the flexible nested structures the engine produces.
--
-- Positioning rule (§10): nothing here is an "appraisal." Values are automated
-- estimates. No demographic / protected-class columns exist, by design (§4.7).

BEGIN;

-- Accounts & members (§8 Account/Member) -----------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  plan            TEXT NOT NULL DEFAULT 'payg',        -- payg | pro | partner
  discount_bps    INTEGER NOT NULL DEFAULT 0,          -- membership discount, basis points
  created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id          TEXT PRIMARY KEY,                    -- public id; sent as fmk_<key_id>.<secret>
  secret_hash     TEXT NOT NULL,                       -- sha256(secret); never the plaintext
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'payg',
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(account_id);

-- Properties (§8 Property) --------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id              TEXT PRIMARY KEY,
  address         TEXT NOT NULL,
  apn             TEXT,
  sqft            NUMERIC,
  beds            NUMERIC,
  baths           NUMERIC,
  lot_sqft        NUMERIC,
  year_built      INTEGER,
  property_type   TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  created_at      BIGINT NOT NULL
);

-- Parcel / footprint (§8 Footprint/Parcel; §4.2) ---------------------------
CREATE TABLE IF NOT EXISTS parcels (
  id              TEXT PRIMARY KEY,
  property_id     TEXT REFERENCES properties(id) ON DELETE CASCADE,
  apn             TEXT,
  recorded_sqft   NUMERIC,
  observed_sqft   NUMERIC,
  additions_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  footprint       JSONB,
  permits         JSONB
);

-- Orchestration jobs (drives the pipeline; not a §8 entity but the spine) ---
CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  account_id      TEXT,                                -- ownership tag for API scoping
  status          TEXT NOT NULL,                       -- queued|running|completed|failed|canceled
  input           JSONB NOT NULL,
  stages          JSONB NOT NULL,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  error           TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Valuations (§8 Valuation) -------------------------------------------------
CREATE TABLE IF NOT EXISTS valuations (
  id              TEXT PRIMARY KEY,
  job_id          TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  account_id      TEXT,
  property_id     TEXT REFERENCES properties(id) ON DELETE SET NULL,
  subject_address TEXT,
  as_is           NUMERIC,
  arv_light       NUMERIC,
  arv_medium      NUMERIC,
  arv_high        NUMERIC,
  confidence_score NUMERIC,
  confidence_fsd  NUMERIC,
  radius_miles    NUMERIC,
  bands           JSONB,
  audit           JSONB,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_valuations_account ON valuations(account_id);
CREATE INDEX IF NOT EXISTS idx_valuations_job ON valuations(job_id);

-- Comps (§8 Comp) -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS comps (
  id              TEXT PRIMARY KEY,
  valuation_id    TEXT REFERENCES valuations(id) ON DELETE CASCADE,
  address         TEXT,
  sqft            NUMERIC,
  sale_price      NUMERIC,
  sale_date       TEXT,
  distance_miles  NUMERIC,
  renovated       BOOLEAN,
  weight          NUMERIC,
  price_per_sqft  NUMERIC,
  source_url      TEXT
);
CREATE INDEX IF NOT EXISTS idx_comps_valuation ON comps(valuation_id);

-- Scope of Work (§8 ScopeOfWork; §4.3) --------------------------------------
CREATE TABLE IF NOT EXISTS scope_of_work (
  id              TEXT PRIMARY KEY,
  account_id      TEXT,
  subject         JSONB,
  line_items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_tier   TEXT,
  true_scope_arv  NUMERIC,
  reasoning       TEXT,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sow_account ON scope_of_work(account_id);

-- Renders (§8 Render; §4.4) -------------------------------------------------
CREATE TABLE IF NOT EXISTS renders (
  id              TEXT PRIMARY KEY,
  valuation_id    TEXT REFERENCES valuations(id) ON DELETE CASCADE,
  scope           TEXT,
  room            TEXT,
  before_url      TEXT,
  after_url       TEXT,
  staged_url      TEXT
);

-- Reports (§8 Report) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,                    -- e.g. FM-<jobId>
  valuation_id    TEXT REFERENCES valuations(id) ON DELETE SET NULL,
  job_id          TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  account_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'ready',
  certified_by    TEXT,                                -- 'ai' | 'ai_human' | reviewer
  url             TEXT,
  html            TEXT,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_job ON reports(job_id);
CREATE INDEX IF NOT EXISTS idx_reports_account ON reports(account_id);

-- Capture sessions (§8 CaptureSession; §4.1) --------------------------------
CREATE TABLE IF NOT EXISTS capture_sessions (
  id              TEXT PRIMARY KEY,
  account_id      TEXT,
  subject         JSONB,
  url             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'created',     -- created|in_progress|complete|expired
  created_at      BIGINT NOT NULL
);

-- Watches / alerts (§8 Watch/Alert; §5 live monitoring) ---------------------
CREATE TABLE IF NOT EXISTS watches (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT,
  subject            JSONB NOT NULL,
  last_valuation_id  TEXT REFERENCES valuations(id) ON DELETE SET NULL,
  change_delta       NUMERIC,
  webhook_url        TEXT,
  notified_at        BIGINT,
  created_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watches_account ON watches(account_id);

-- Usage metering (§9 "usage metered for billing") ---------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  units           INTEGER NOT NULL DEFAULT 1,
  at              BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_account_at ON usage_events(account_id, at);

COMMIT;
