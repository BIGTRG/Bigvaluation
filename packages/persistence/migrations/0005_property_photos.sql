-- ValueProof — 0005: Property photo uploads (§4.1 capture → §4.4 renders)
BEGIN;

CREATE TABLE IF NOT EXISTS property_photos (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  label       TEXT,
  media_type  TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_property_photos_account ON property_photos(account_id, created_at DESC);

COMMIT;
