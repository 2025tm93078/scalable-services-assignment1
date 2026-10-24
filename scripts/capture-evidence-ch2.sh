#!/usr/bin/env bash
# Runs the Challenge 2 script and saves raw evidence files into evidence/challenge-2-idempotency/
# Usage (from repo root, with mock-gateway + payment running):
#   ./scripts/capture-evidence-ch2.sh
#   PG_CONTAINER=<postgres-container-name> ./scripts/capture-evidence-ch2.sh   # also saves DB state via docker exec
set -u
OUT=evidence/challenge-2-idempotency
GATEWAY_URL=${GATEWAY_URL:-http://localhost:3005}
mkdir -p "$OUT"

echo "Command: node scripts/idempotency-test.js    ($(date -u +%FT%TZ))" | tee "$OUT/output.txt"
node scripts/idempotency-test.js 2>&1 | tee -a "$OUT/output.txt"
STATUS=${PIPESTATUS[0]}

curl -s "$GATEWAY_URL/admin/state" > "$OUT/gateway-state.txt" && echo >> "$OUT/gateway-state.txt"

if [ -n "${PG_CONTAINER:-}" ]; then
  {
    echo "-- captured $(date -u +%FT%TZ)"
    echo "-- payments: one row per order despite repeated / concurrent requests"
    docker exec -i "$PG_CONTAINER" psql -U payment_user -d payment_db -c \
      "SELECT order_id, status, gateway_ref, count(*) OVER (PARTITION BY order_id) AS rows_for_order FROM payments ORDER BY created_at;"
    echo "-- idempotency_keys: stored fingerprint, state and response"
    docker exec -i "$PG_CONTAINER" psql -U payment_user -d payment_db -c \
      "SELECT key, left(request_hash, 12) AS request_hash, state, status_code FROM idempotency_keys ORDER BY created_at;"
  } > "$OUT/db-state.txt" 2>&1
  echo "Saved DB state to $OUT/db-state.txt"
else
  echo "(PG_CONTAINER not set: run the SQL queries from the evidence README by hand and save them as db-state.txt)"
fi
exit "$STATUS"
