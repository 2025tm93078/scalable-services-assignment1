# Scalable Services — Assignment 1

E-commerce checkout system built with microservices.

**Team:** Person 1 (Inventory), Person 2 (Order), Person 3 (Payment + Notification), Person 4 (Catalog)
**Stack:** Node.js, Express, PostgreSQL  
**Course:** SEZG583 — BITS Pilani WILP

---

## Services

| Service       | Port | Responsibility                          |
|---------------|------|-----------------------------------------|
| Inventory     | 3001 | Stock management and reservations       |
| Order         | 3002 | Checkout orchestration and state machine|
| Payment       | 3003 | Payments with idempotency               |
| Notification  | 3004 | Confirmation notifications              |
| Mock Gateway  | 3005 | Simulated payment provider              |
| Catalog       | 3006 | Product details and catalog management  |

---

## Prerequisites

- Node.js 18+
- Docker Desktop

---

## Setup

### 1. Start the database

```bash
docker compose up -d
```

### 2. Start Inventory service

```bash
cd services/inventory
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3001/health` — should return `{"service":"inventory","status":"UP"}`  
API docs: `http://localhost:3001/api-docs`

### 3. Start other services (Person 2 and 3 fill these in)

```bash
cd services/order
cp .env.example .env
npm install
npm start
```

```bash
cd services/payment
cp .env.example .env
npm install
npm start
```

```bash
cd services/notification
cp .env.example .env
npm install
npm start
```

### 4. Start Catalog service (Person 4)

```bash
cd services/catalog
cp .env.example .env
npm install
npm run dev
```
Open `http://localhost:3006/health` — `should return {"status":"OK","service":"catalog"}`
API docs: `http://localhost:3006/api-docs`

---

## Run Tests

```bash
cd services/inventory
npm test
```

```bash
cd services/catalog
npm test
```

---

## Challenge Scripts

Run from the root folder with all services running:

```bash
node scripts/concurrency-test.js      # Challenge 1 — Inventory
node scripts/idempotency-test.js      # Challenge 2 — Payment (Person 3)
node scripts/saga-failure-test.js     # Challenge 3C — Order (Person 2)
node scripts/e2e-test.js              # End-to-end happy path (Person 2)
```

---

## Evidence

| Folder                              | Challenge                  |
|-------------------------------------|----------------------------|
| evidence/challenge-1-concurrency/   | Atomic stock reservation   |
| evidence/challenge-2-idempotency/   | Payment idempotency        |
| evidence/challenge-3c-saga/         | Saga with compensation     |

---

## Layout

```
services/        one folder per service
scripts/         challenge and e2e test scripts
evidence/        proof per challenge
docs/            diagrams and OpenAPI specs
db/              Postgres init SQL
```
## Payment, Notification and Mock Gateway (Person 3)

| Service | Port | Env vars (see each `.env.example`) |
|---|---|---|
| mock-gateway | 3005 | `PORT`, `LATENCY_MS`, `FAIL_RATE` |
| payment | 3003 | `PORT`, `DATABASE_URL`, `GATEWAY_URL`, `GATEWAY_TIMEOUT_MS`, `IDEMPOTENCY_WAIT_MS` |
| notification | 3004 | `PORT`, `DATABASE_URL` |

### Run

The databases `payment_db` and `notification_db` (each with its own user) come from the SQL file in `db/`, set up in the same step as the other services. Tables are created automatically when each service starts. If your Postgres is not on port 5432, change it in `DATABASE_URL` in each `.env`.

For each of `mock-gateway`, `payment`, `notification` (start mock-gateway first):

    cd services/<name>
    cp .env.example .env
    npm install
    npm start

Health checks: `curl localhost:3005/health`, `curl localhost:3003/health`, `curl localhost:3004/health`.
Swagger UI: http://localhost:3003/api-docs and http://localhost:3004/api-docs

### Test

    cd services/payment && npm test        # BR5 + API tests (13 tests)
    cd services/notification && npm test   # BR6 + API tests (9 tests)
    node scripts/idempotency-test.js       # Challenge 2 (needs mock-gateway and payment running)

On Git Bash for Windows, if you pipe the output (`| tee file`), write `command node ...` to avoid the "stdout is not a tty" error.

### Business rules (Person 3)

| ID | Rule | Code | Test |
|---|---|---|---|
| BR5 | The same Idempotency-Key never produces two charges | `services/payment/src/services/payments.service.js` | `services/payment/tests/payments.service.test.js` |
| BR6 | A notification is sent only for CONFIRMED orders | `services/notification/src/services/notifications.service.js` | `services/notification/tests/notifications.service.test.js` |

### API contract for the Order service

Charge:

    curl -X POST localhost:3003/api/v1/payments \
      -H 'Content-Type: application/json' -H 'Idempotency-Key: pay-<orderId>' -H 'X-Request-Id: <id>' \
      -d '{"orderId":"<orderId>","amount":499.5}'

- 201 `{ id, orderId, amount, status:"SUCCESS", gatewayRef, createdAt }`
- 422 `PAYMENT_DECLINED` (payment failed, so release stock and cancel the order)
- 504 `GATEWAY_TIMEOUT` (safe to retry with the SAME key)
- 409 `REQUEST_IN_PROGRESS` or `REQUEST_FAILED_RETRY` (retry shortly with the same key)
- 400 invalid input or missing key; 422 `IDEMPOTENCY_KEY_REUSED` if the key is reused with a different body

Notify (call only after the order is CONFIRMED):

    curl -X POST localhost:3004/api/v1/notifications \
      -H 'Content-Type: application/json' -H 'X-Request-Id: <id>' \
      -d '{"orderId":"<orderId>","orderStatus":"CONFIRMED"}'

- 201 stored; 422 `ORDER_NOT_CONFIRMED` if `orderStatus` is not `CONFIRMED` (`type` is optional, default `ORDER_CONFIRMED`)

Force a payment failure for the saga demo:

    curl -X POST localhost:3005/admin/fail-mode -H 'Content-Type: application/json' -d '{"mode":"always"}'   # decline every charge
    curl -X POST localhost:3005/admin/fail-mode -H 'Content-Type: application/json' -d '{"mode":"error"}'    # gateway returns 500
    curl -X POST localhost:3005/admin/fail-mode -H 'Content-Type: application/json' -d '{"mode":"off"}'      # back to normal

Other gateway switches: `POST /admin/latency {"ms":500}`, `POST /admin/reset`, `GET /admin/state`.

### Error format (all services)

    { "error": { "code": "PAYMENT_DECLINED", "message": "...", "requestId": "..." } }
## Catalog Service (Person 4)

| Service | Port | Env vars (see `.env.example`) |
|---|---|---|
| catalog | 3006 | `PORT`, `DATABASE_URL` |

### Business rules (Person 4)

| ID | Rule | Code | Test |
|---|---|---|---|
| BR7 | A product price must be strictly greater than zero | `services/catalog/src/services/productService.js` | `services/catalog/tests/productService.test.js` |
| BR8 | A product must belong to a predefined valid category | `services/catalog/src/services/productService.js` | `services/catalog/tests/productService.test.js` |