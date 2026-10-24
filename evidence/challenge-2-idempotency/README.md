# Challenge 2: Idempotency (Payment service)

## Claim
Repeating a payment request with the same `Idempotency-Key` returns the same result and never causes a second charge. This also holds when identical requests arrive at the same instant.

## How to reproduce
```bash
# 1. start Postgres + mock-gateway (3005) + payment (3003)   (see top-level README)
# 2. from the repo root:
PG_CONTAINER=<your-postgres-container> ./scripts/capture-evidence-ch2.sh
```

## Files and the claim each one supports
| File | What it shows | Claim supported |
|---|---|---|
| `scripts/idempotency-test.js` | The script (6 cases) | Repeatable test |
| `output.txt` | Raw timestamped script output | Cases 1-6 all pass |
| `db-state.txt` | `payments` has one row per order; `idempotency_keys` holds the fingerprint and stored response | No duplicate record in the database |
| `gateway-state.txt` | Gateway counters (`chargesAccepted`) | The provider itself was charged once |
| `payment-log.txt` (copy the Payment terminal log here) | Log lines `idempotency key already seen: replay path` with `requestId` | Replays are visible in logs |
| `challenge-2-idempotency.png` (take it yourself) | Screenshot of the command, output and timestamp | Evidence format required by the brief |

## SQL to capture the database state (if you don't use `PG_CONTAINER`)
```bash
docker exec -it <pg-container> psql -U payment_user -d payment_db
```
```sql
SELECT order_id, status, gateway_ref, created_at FROM payments ORDER BY created_at;
SELECT key, left(request_hash, 12) AS request_hash, state, status_code FROM idempotency_keys ORDER BY created_at;
```
Save the output as `db-state.txt`.

## The six cases
| # | Case | Expected | Type |
|---|---|---|---|
| 1 | Same key + same body, sequentially | 201 both times, same payment id, second has `Idempotency-Replayed: true`, 1 row | success |
| 2 | Same key + different body | 422 `IDEMPOTENCY_KEY_REUSED`, still 1 row | failure |
| 3 | 5 identical requests via `Promise.all` | All 201, same id, exactly 1 real execution, 1 DB row, gateway charged once | concurrency |
| 4 | Gateway declines | 422 `PAYMENT_DECLINED`, repeat is replayed (gateway asked once) | failure |
| 5 | Gateway error (500), then recovery | 504 `GATEWAY_TIMEOUT`, no row, key released, retry with same key gives 201 | failure |
| 6 | Missing `Idempotency-Key` | 400 `MISSING_IDEMPOTENCY_KEY` | validation |

## Design
1. Hash the request body (SHA-256 over sorted fields): the fingerprint.
2. `INSERT INTO idempotency_keys ... ON CONFLICT (key) DO NOTHING`. The PRIMARY KEY lets exactly one concurrent request win.
3. The winner calls the gateway, then saves the `payments` row and the stored response in **one DB transaction** and marks the key `DONE`.
4. A request that finds the key: different fingerprint gives 422; `DONE` replays the stored response; `IN_PROGRESS` waits briefly (up to `IDEMPOTENCY_WAIT_MS`) and then replays, or returns 409.
5. Technical failure (timeout / 5xx): the key is deleted so a retry can run. A decline is a business result and is stored and replayed.

## Why a plain check-then-insert would fail
`SELECT key` -> "not found" -> call gateway -> `INSERT` leaves a race window. Two simultaneous requests can both read "not found", both call the gateway and both charge the customer. With the unique key, the database decides atomically who is first, so the second request can never reach the gateway.

## Alternatives considered
- **In-memory lock / Map in Node:** breaks with more than one instance (Assignment 2 runs several containers) and loses state on restart.
- **Redis `SET NX`:** works, but adds a component that must be containerised. The database already gives atomicity.
- **Unique constraint on `payments.order_id`:** stops duplicates per order but cannot replay the original response or detect a changed payload.

## Limitations (honest list)
- A gateway **timeout is ambiguous**: the provider may have charged before the timeout. The key is released, so a retry could double charge in a real system. A real fix is to look up the charge at the provider by reference before retrying.
- If the service crashes while a key is `IN_PROGRESS`, that key stays stuck (duplicates get 409). A fix is a stale-key timeout.
- Keys are never deleted. A real system would expire them (e.g. after 24 hours).
