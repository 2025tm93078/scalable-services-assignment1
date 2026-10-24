#!/usr/bin/env node
/**
 * Challenge 2 - Idempotency test (Person 3)
 * Requires: mock-gateway (3005) and payment (3003) running. Node 18+ (uses built-in fetch, no dependencies).
 *
 * Cases:
 *  1. Sequential repeat: same key + same body -> same result, replayed, no second charge
 *  2. Same key + different body -> rejected 422
 *  3. Concurrent: N identical requests at the same instant -> exactly ONE payment
 *  4. Failure: declined payment is stored and replayed (no re-charge)
 *  5. Failure: gateway error -> 504, key released, retry with same key succeeds
 *  6. Validation: missing Idempotency-Key -> 400
 */
const PAYMENT = process.env.PAYMENT_URL || 'http://localhost:3003';
const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:3005';
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);

const run = `${Date.now()}`;
let failures = 0;
const now = () => new Date().toISOString();
const log = (msg) => console.log(`[${now()}] ${msg}`);

function check(name, cond, detail = '') {
  if (cond) log(`  PASS  ${name}`);
  else { failures += 1; log(`  FAIL  ${name} ${detail}`); }
}

async function call(method, url, { key, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, replayed: res.headers.get('idempotency-replayed') };
}
const charge = (key, body) => call('POST', `${PAYMENT}/api/v1/payments`, { key, body });
const gateway = (path, body) => call('POST', `${GATEWAY}${path}`, { body });
const gwState = async () => (await call('GET', `${GATEWAY}/admin/state`)).body;
const paymentsOf = async (orderId) => (await call('GET', `${PAYMENT}/api/v1/payments?orderId=${orderId}`)).body.payments;

async function main() {
  log(`Idempotency test run ${run} against ${PAYMENT} (gateway ${GATEWAY})`);
  await gateway('/admin/reset');
  await gateway('/admin/latency', { ms: 500 }); // slow gateway so concurrent requests really overlap

  // ---- Case 1: sequential repeat ----
  log('CASE 1: sequential repeat (same key, same payload)');
  const k1 = `case1-${run}`; const b1 = { orderId: `order-c1-${run}`, amount: 499.5 };
  const first = await charge(k1, b1);
  const second = await charge(k1, b1);
  log(`  first : ${first.status} replayed=${first.replayed} id=${first.body.id}`);
  log(`  second: ${second.status} replayed=${second.replayed} id=${second.body.id}`);
  check('first call returns 201 and is not a replay', first.status === 201 && first.replayed === 'false');
  check('second call returns the same payment (replay)', second.status === 201 && second.replayed === 'true' && second.body.id === first.body.id);
  check('exactly one payment row for the order', (await paymentsOf(b1.orderId)).length === 1);

  // ---- Case 2: same key, different payload ----
  log('CASE 2: same key with a different payload');
  const diff = await charge(k1, { ...b1, amount: 1 });
  log(`  response: ${diff.status} ${JSON.stringify(diff.body)}`);
  check('rejected with 422 IDEMPOTENCY_KEY_REUSED', diff.status === 422 && diff.body.error.code === 'IDEMPOTENCY_KEY_REUSED');
  check('still exactly one payment row', (await paymentsOf(b1.orderId)).length === 1);

  // ---- Case 3: concurrent identical requests ----
  log(`CASE 3: ${CONCURRENCY} identical requests fired at the same instant (Promise.all)`);
  await gateway('/admin/reset'); await gateway('/admin/latency', { ms: 500 });
  const k3 = `case3-${run}`; const b3 = { orderId: `order-c3-${run}`, amount: 250 };
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => charge(k3, b3)));
  results.forEach((r, i) => log(`  request ${i + 1}: ${r.status} replayed=${r.replayed} id=${r.body.id}`));
  const ids = new Set(results.map((r) => r.body.id));
  check('all requests returned 201', results.every((r) => r.status === 201));
  check('all requests returned the same payment id', ids.size === 1);
  check('exactly one request did the real work (others replayed)', results.filter((r) => r.replayed === 'false').length === 1);
  check('exactly ONE payment row in the database', (await paymentsOf(b3.orderId)).length === 1);
  const st3 = await gwState();
  log(`  gateway state: ${JSON.stringify(st3)}`);
  check('the gateway charged exactly once', st3.chargesAccepted === 1);

  // ---- Case 4: declined payment is stored and replayed ----
  log('CASE 4 (failure): declined payment is replayed, not re-charged');
  await gateway('/admin/reset'); await gateway('/admin/latency', { ms: 100 });
  await gateway('/admin/fail-mode', { mode: 'always' });
  const k4 = `case4-${run}`; const b4 = { orderId: `order-c4-${run}`, amount: 80 };
  const d1 = await charge(k4, b4); const d2 = await charge(k4, b4);
  log(`  first : ${d1.status} ${d1.body.error && d1.body.error.code} replayed=${d1.replayed}`);
  log(`  second: ${d2.status} ${d2.body.error && d2.body.error.code} replayed=${d2.replayed}`);
  check('first call 422 PAYMENT_DECLINED', d1.status === 422 && d1.body.error.code === 'PAYMENT_DECLINED');
  check('repeat returns the same 422 as a replay', d2.status === 422 && d2.replayed === 'true');
  const st4 = await gwState();
  check('gateway was asked only once', st4.chargesDeclined === 1);

  // ---- Case 5: gateway error then retry ----
  log('CASE 5 (failure): gateway error -> 504, then retry with the same key succeeds');
  await gateway('/admin/fail-mode', { mode: 'error' });
  const k5 = `case5-${run}`; const b5 = { orderId: `order-c5-${run}`, amount: 60 };
  const e1 = await charge(k5, b5);
  log(`  during outage: ${e1.status} ${e1.body.error && e1.body.error.code}`);
  check('504 GATEWAY_TIMEOUT while the gateway is failing', e1.status === 504 && e1.body.error.code === 'GATEWAY_TIMEOUT');
  check('no payment row was created during the outage', (await paymentsOf(b5.orderId)).length === 0);
  await gateway('/admin/fail-mode', { mode: 'off' });
  const e2 = await charge(k5, b5);
  log(`  after recovery (same key): ${e2.status} replayed=${e2.replayed} id=${e2.body.id}`);
  check('retry with the same key succeeds (201)', e2.status === 201);
  check('exactly one payment row after the retry', (await paymentsOf(b5.orderId)).length === 1);

  // ---- Case 6: validation ----
  log('CASE 6 (failure): missing Idempotency-Key');
  const m = await charge(undefined, { orderId: 'x', amount: 1 });
  log(`  response: ${m.status} ${JSON.stringify(m.body)}`);
  check('400 MISSING_IDEMPOTENCY_KEY', m.status === 400 && m.body.error.code === 'MISSING_IDEMPOTENCY_KEY');

  await gateway('/admin/reset');
  log(failures === 0 ? 'RESULT: ALL CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`[${now()}] ERROR: ${e.message}`); process.exit(2); });
