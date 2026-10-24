CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   TEXT NOT NULL,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('SENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
