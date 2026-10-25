# Challenge 3C – Design Explanation: Saga with Compensation

## What is a Saga?

A Saga is a pattern for managing distributed transactions across multiple microservices
**without a global two-phase commit**. Instead of locking resources across services,
each step is a local transaction. If a later step fails, **compensating transactions**
undo the earlier steps.

---

## Our Saga: Checkout Flow

The Order service acts as the **orchestrator** — it calls each service in sequence and
decides what to do when something goes wrong.

```
Customer
   │
   ▼
POST /api/v1/orders        ← Order Service (orchestrator)
   │
   ├─ 1. Save order (PENDING)
   │
   ├─ 2. POST /api/v1/reservations  ──►  Inventory Service
   │      success → order = STOCK_RESERVED
   │      fail    → order = CANCELLED  (no compensation needed, nothing reserved yet)
   │
   ├─ 3. POST /api/v1/payments       ──►  Payment Service  (with Idempotency-Key: pay-<orderId>)
   │      success → order = PAID
   │      fail    → COMPENSATE:
   │                  POST /api/v1/reservations/:id/release  ──►  Inventory Service
   │                  order = CANCELLED
   │
   ├─ 4. order = CONFIRMED
   │      POST /api/v1/reservations/:id/confirm  ──►  Inventory Service
   │
   └─ 5. POST /api/v1/notifications  ──►  Notification Service  (fire-and-forget, non-fatal)
```

---

## Business Rules Implemented

### BR3 – Only allowed state transitions
All status moves are validated by `assertTransition()` before they are applied.
Illegal moves (e.g. `PENDING → CONFIRMED`) throw `AppError(409, INVALID_STATE_TRANSITION)`.

```
PENDING        → STOCK_RESERVED, CANCELLED
STOCK_RESERVED → PAID, CANCELLED
PAID           → CONFIRMED
CONFIRMED      → (terminal)
CANCELLED      → (terminal)
```

### BR4 – Payment failure triggers compensation
If step 3 (payment) fails:
1. `releaseReservation(reservationId)` is called on Inventory.
2. The order is transitioned to `CANCELLED`.
3. Both steps are recorded in `saga_log` (`RELEASE_STOCK:COMPENSATED`, `CANCEL_ORDER:SUCCEEDED`).

---

## Why This Approach is Safe

### Idempotency of compensation
The `release` endpoint on Inventory is safe to call multiple times — it only restores
stock if the reservation is still in `RESERVED` state (BR2). Calling it twice does NOT
restore stock twice.

### Idempotency of payment
The Payment service receives `Idempotency-Key: pay-<orderId>`. If the Order service
retries (e.g. after a network timeout), the second call returns the same result
without charging the customer again.

### Non-fatal notification
The notification step is fire-and-forget. If it fails, the order remains `CONFIRMED`
and the failure is logged. This is correct business logic: a failed SMS should not
cancel a paid order.

### Saga log as evidence
Every step (STARTED / SUCCEEDED / FAILED / COMPENSATED) is written to `saga_log`.
This provides a complete audit trail and is the primary evidence for this challenge.

---

## What happens if compensation itself fails?

If `releaseReservation` fails (e.g. Inventory is down during compensation):
- The error is logged as `RELEASE_STOCK:FAILED` in the saga log.
- The order is still cancelled.
- The reservation stays `RESERVED` — stock is effectively stuck.
- **This is a known limitation** (see report Section 9): a production system would
  need a recovery job to scan for `RELEASE_STOCK:FAILED` rows and retry them.

---

## Design Decisions

| Decision | Choice | Rejected alternative | Reason |
|----------|--------|---------------------|--------|
| Orchestration vs choreography | Orchestration (Order calls each service) | Event bus (each service listens for events) | Simpler to reason about, easier to test, compensation flow is explicit |
| Compensation strategy | Rollback (release stock) | No compensation (accept inconsistency) | Correctness: over-reserved stock is a real business problem |
| Notification failure | Non-fatal (order stays CONFIRMED) | Fatal (rollback everything) | Sending a confirmation message is not worth cancelling a paid order |
| Idempotency key for payment | `pay-<orderId>` sent by Order | Payment service generates its own key | Order can safely retry if network fails between step 3 and step 4 |
