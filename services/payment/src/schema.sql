CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  gateway_ref TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The PRIMARY KEY on "key" is what makes two simultaneous identical requests safe:
-- only one INSERT can win.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  request_hash  TEXT NOT NULL,
  response_body JSONB,
  status_code   INT,
  state         TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'DONE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
