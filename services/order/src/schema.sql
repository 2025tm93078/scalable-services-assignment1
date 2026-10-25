-- Orders table: tracks the state machine
CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','STOCK_RESERVED','PAID','CONFIRMED','CANCELLED')),
  total       NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0)
);

-- Saga log: one row per step (started / succeeded / failed / compensated)
CREATE TABLE IF NOT EXISTS saga_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('STARTED','SUCCEEDED','FAILED','COMPENSATED')),
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index to quickly look up all saga steps for an order
CREATE INDEX IF NOT EXISTS saga_log_order_id_idx ON saga_log(order_id);
