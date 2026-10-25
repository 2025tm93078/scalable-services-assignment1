# Challenge 3C – Saga with Compensation: Evidence

## What this challenge proves

When payment fails mid-checkout, the Order service (acting as saga orchestrator)
**compensates all earlier steps automatically** so the system ends in a consistent state:

| Step | What happens on failure |
|------|------------------------|
| Stock reserved → Payment fails | `releaseReservation` called, stock restored, order → `CANCELLED` |
| Stock not available | Order → `CANCELLED` immediately, payment never called |

---

## File → Claim mapping

| File | Claim it supports |
|------|-------------------|
| [`saga-failure-test.js`](../../../scripts/saga-failure-test.js) | The runnable test script covering all 3 cases |
| [`output-happy-path.txt`](./output-happy-path.txt) | Case 1: full checkout succeeds, order ends `CONFIRMED` |
| [`output-payment-failure.txt`](./output-payment-failure.txt) | Case 2: payment declined → stock released, order `CANCELLED` |
| [`output-stock-failure.txt`](./output-stock-failure.txt) | Case 3: insufficient stock → order `CANCELLED`, payment never called |
| [`db-state-after-saga.txt`](./db-state-after-saga.txt) | SQL queries showing final DB state (saga_log + orders + reservations) |
| [`explanation.md`](./explanation.md) | Written explanation of the saga design and why it works |

---

## How to reproduce

### Prerequisites
All five services must be running:
```bash
# In separate terminals (or via docker-compose):
cd services/inventory    && npm start   # :3001
cd services/order        && npm start   # :3002
cd services/payment      && npm start   # :3003
cd services/notification && npm start   # :3004
cd services/mock-gateway && npm start   # :3005
```

### Run the test
```bash
node scripts/saga-failure-test.js
```

Expected final line: `✔  ALL CHECKS PASSED`

### Environment overrides (optional)
```bash
ORDER_URL=http://localhost:3002 \
INVENTORY_URL=http://localhost:3001 \
GATEWAY_URL=http://localhost:3005 \
node scripts/saga-failure-test.js
```

---

## SQL to verify DB state after the test

```sql
-- Show every saga step for recent orders
SELECT o.id AS order_id, o.status AS order_status,
       sl.step, sl.status AS step_status, sl.detail, sl.created_at
FROM orders o
JOIN saga_log sl ON sl.order_id = o.id
ORDER BY o.created_at DESC, sl.created_at ASC;

-- Show reservation status (should be RELEASED for failed orders)
SELECT r.id, r.order_id, r.product_id, r.qty, r.status
FROM reservations r
ORDER BY r.created_at DESC
LIMIT 10;

-- Show final stock levels
SELECT p.sku, s.available
FROM products p
JOIN stock s ON s.product_id = p.id
ORDER BY p.created_at DESC
LIMIT 10;
```

---

## State machine transitions exercised

```
PENDING → STOCK_RESERVED → CANCELLED   (payment failure, BR4)
PENDING → CANCELLED                     (insufficient stock)
PENDING → STOCK_RESERVED → PAID → CONFIRMED  (happy path)
```
