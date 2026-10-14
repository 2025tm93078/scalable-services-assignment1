# Scalable Services — Assignment 1

E-commerce checkout system built with microservices.

**Team:** Person 1 (Inventory), Person 2 (Order), Person 3 (Payment + Notification)  
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

---

## Run Tests

```bash
cd services/inventory
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