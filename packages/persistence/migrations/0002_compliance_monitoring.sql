-- ValueProof — 0002: compliance attestations + watch monitoring (§4.7, §5.3)
BEGIN;

-- Investor-only scope lock: recorded attestation per scope of work (§4.7).
-- (Valuation attestations live on the job input JSON in jobs.input.)
ALTER TABLE scope_of_work ADD COLUMN IF NOT EXISTS attestation JSONB;

-- Live valuation monitoring baseline (§5.3).
ALTER TABLE watches ADD COLUMN IF NOT EXISTS attestation JSONB;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS last_as_is NUMERIC;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS last_arv NUMERIC;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS last_checked_at BIGINT;

COMMIT;
