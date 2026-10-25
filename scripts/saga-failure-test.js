#!/usr/bin/env node
/**
 * Challenge 3C – Saga with Compensation (Person 2)
 * ─────────────────────────────────────────────────
 * Requires all services running:
 *   inventory  → http://localhost:3001
 *   order      → http://localhost:3002
 *   payment    → http://localhost:3003
 *   notification → http://localhost:3004
 *   mock-gateway → http://localhost:3005
 *
 * Uses Node 18+ built-in fetch. No extra dependencies needed.
 *
 * Test cases:
 *   CASE 1 – Happy path:   full checkout succeeds → order CONFIRMED
 *   CASE 2 – Payment fail: payment declined → stock RELEASED, order CANCELLED
 *   CASE 3 – Stock fail:   insufficient stock → order CANCELLED immediately (no payment attempt)
 */

'use strict';

const ORDER_URL    = process.env.ORDER_URL    || 'http://localhost:3002';
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3001';
const GATEWAY_URL  = process.env.GATEWAY_URL  || 'http://localhost:3005';

const now     = () => new Date().toISOString();
const log     = (msg) => console.log(`[${now()}] ${msg}`);
const divider = (title) => console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) log(`  ✔ PASS  ${name}`);
  else { failures += 1; log(`  ✘ FAIL  ${name}  ${detail}`); }
}

// ── Generic HTTP helpers ──────────────────────────────────────────────────────

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

const post = (url, body)    => request('POST', url, body);
const get  = (url)          => request('GET', url);
const gwAdmin = (path, body) => post(`${GATEWAY_URL}${path}`, body);
const orderAPI = (path, body) => post(`${ORDER_URL}${path}`, body);
const getOrder = (id)        => get(`${ORDER_URL}/api/v1/orders/${id}`);

// ── Setup helpers ─────────────────────────────────────────────────────────────

/** Create a product in Inventory with the given initial stock */
async function createProduct(initialStock) {
  const sku = `SAGA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const res = await post(`${INVENTORY_URL}/api/v1/products`, {
    sku,
    name: `Saga Test Product (${sku})`,
    initialStock,
  });
  if (res.status !== 201) throw new Error(`Failed to create product: ${JSON.stringify(res.body)}`);
  log(`  Product created: id=${res.body.id}, sku=${sku}, stock=${initialStock}`);
  return res.body.id;
}

/** Print the saga log steps for an order in a readable table */
function printSagaLog(sagaSteps) {
  if (!sagaSteps || sagaSteps.length === 0) {
    log('  (no saga steps found)');
    return;
  }
  log('  Saga log:');
  sagaSteps.forEach((s) => {
    const detail = s.detail ? JSON.stringify(s.detail) : '';
    log(`    [${s.created_at}]  ${s.step.padEnd(22)}  ${s.status.padEnd(12)}  ${detail}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CASE 1 – Happy path
// ══════════════════════════════════════════════════════════════════════════════

async function caseHappyPath() {
  divider('CASE 1: Happy path – full checkout succeeds → order CONFIRMED');

  await gwAdmin('/admin/reset');
  await gwAdmin('/admin/latency', { ms: 100 });

  const productId = await createProduct(10);

  log('  Placing order …');
  const res = await orderAPI('/api/v1/orders', {
    customerId: 'cust-happy',
    items: [{ productId, qty: 2, price: 49.99 }],
  });

  log(`  Response: HTTP ${res.status}`);
  console.log(JSON.stringify(res.body, null, 2));

  check('HTTP 201 returned',         res.status === 201);
  check('order status is CONFIRMED', res.body.status === 'CONFIRMED');
  check('total is correct',          Number(res.body.total) === 99.98);

  if (res.body.id) {
    const detail = await getOrder(res.body.id);
    printSagaLog(detail.body.sagaSteps);

    const steps = (detail.body.sagaSteps || []).map((s) => `${s.step}:${s.status}`);
    check('RESERVE_STOCK:SUCCEEDED in saga log',  steps.includes('RESERVE_STOCK:SUCCEEDED'));
    check('CHARGE_PAYMENT:SUCCEEDED in saga log', steps.includes('CHARGE_PAYMENT:SUCCEEDED'));
    check('CONFIRM_ORDER:SUCCEEDED in saga log',  steps.includes('CONFIRM_ORDER:SUCCEEDED'));
    check('No FAILED steps',                      !steps.some((s) => s.endsWith(':FAILED')));
  }

  const gwState = await gwAdmin('/admin/state');
  log(`  Gateway state: ${JSON.stringify(gwState.body)}`);
  check('Gateway charged exactly once', gwState.body.chargesAccepted === 1);
}

// ══════════════════════════════════════════════════════════════════════════════
// CASE 2 – Payment failure (saga compensation)
// ══════════════════════════════════════════════════════════════════════════════

async function casePaymentFailure() {
  divider('CASE 2: Payment failure → stock RELEASED, order CANCELLED (BR4)');

  await gwAdmin('/admin/reset');
  await gwAdmin('/admin/latency', { ms: 100 });
  // Force the mock gateway to decline every charge
  await gwAdmin('/admin/fail-mode', { mode: 'always' });
  log('  Mock gateway set to ALWAYS DECLINE charges.');

  const productId = await createProduct(10);

  log('  Placing order (payment will fail) …');
  const res = await orderAPI('/api/v1/orders', {
    customerId: 'cust-fail-payment',
    items: [{ productId, qty: 3, price: 20.00 }],
  });

  log(`  Response: HTTP ${res.status}`);
  console.log(JSON.stringify(res.body, null, 2));

  check('Order rejected (non-2xx)',    res.status >= 400);
  check('Error code is PAYMENT_FAILED', res.body?.error?.code === 'PAYMENT_FAILED');

  // Check stock was restored (compensation)
  const stockRes = await get(`${INVENTORY_URL}/api/v1/products/${productId}/stock`);
  log(`  Stock after failed order: ${JSON.stringify(stockRes.body)}`);
  check('Stock fully restored to 10 (compensation ran)', Number(stockRes.body.available) === 10);

  // If we can find the order id from the error or re-query, show the saga log
  // The error response from the Order service may not return the orderId,
  // so we fetch the latest order from the DB via GET /api/v1/orders if id is in body
  if (res.body?.orderId || res.body?.id) {
    const orderId = res.body.orderId || res.body.id;
    const detail = await getOrder(orderId);
    printSagaLog(detail.body.sagaSteps);
    const steps = (detail.body.sagaSteps || []).map((s) => `${s.step}:${s.status}`);
    check('RESERVE_STOCK:SUCCEEDED in saga log',  steps.includes('RESERVE_STOCK:SUCCEEDED'));
    check('CHARGE_PAYMENT:FAILED in saga log',    steps.includes('CHARGE_PAYMENT:FAILED'));
    check('RELEASE_STOCK:COMPENSATED in saga log', steps.includes('RELEASE_STOCK:COMPENSATED'));
    check('order CANCELLED in saga log',           steps.includes('CANCEL_ORDER:SUCCEEDED') || detail.body.status === 'CANCELLED');
  } else {
    log('  (Order id not returned in error body – saga log not retrieved; check DB manually)');
    log('  SQL to verify: SELECT * FROM saga_log ORDER BY created_at DESC LIMIT 10;');
  }

  // Turn gateway back to normal
  await gwAdmin('/admin/fail-mode', { mode: 'off' });
  await gwAdmin('/admin/reset');
}

// ══════════════════════════════════════════════════════════════════════════════
// CASE 3 – Insufficient stock (no payment attempted)
// ══════════════════════════════════════════════════════════════════════════════

async function caseInsufficientStock() {
  divider('CASE 3: Insufficient stock → order CANCELLED (payment never called)');

  await gwAdmin('/admin/reset');

  // Create a product with only 1 unit
  const productId = await createProduct(1);

  log('  Placing order requesting 5 units (only 1 available) …');
  const res = await orderAPI('/api/v1/orders', {
    customerId: 'cust-no-stock',
    items: [{ productId, qty: 5, price: 10.00 }],
  });

  log(`  Response: HTTP ${res.status}`);
  console.log(JSON.stringify(res.body, null, 2));

  check('Order rejected (non-2xx)',              res.status >= 400);
  check('Error code is STOCK_RESERVATION_FAILED', res.body?.error?.code === 'STOCK_RESERVATION_FAILED');

  const gwState = await gwAdmin('/admin/state');
  log(`  Gateway state: ${JSON.stringify(gwState.body)}`);
  check('Gateway was NEVER called (no payment attempt)', gwState.body.chargesAccepted === 0 && gwState.body.chargesDeclined === 0);

  // Stock should be unchanged
  const stockRes = await get(`${INVENTORY_URL}/api/v1/products/${productId}/stock`);
  log(`  Stock after failed order: ${JSON.stringify(stockRes.body)}`);
  check('Stock unchanged at 1', Number(stockRes.body.available) === 1);
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  divider('Challenge 3C – Saga with Compensation  (Person 2)');
  log(`Order service:    ${ORDER_URL}`);
  log(`Inventory service: ${INVENTORY_URL}`);
  log(`Mock gateway:     ${GATEWAY_URL}`);

  try { await get(`${ORDER_URL}/health`); }
  catch { log('ERROR: Order service not reachable. Start all services first.'); process.exit(1); }

  await caseHappyPath();
  await casePaymentFailure();
  await caseInsufficientStock();

  divider(failures === 0
    ? '✔  ALL CHECKS PASSED'
    : `✘  ${failures} CHECK(S) FAILED`);

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[${now()}] FATAL: ${err.message}`);
  process.exit(2);
});
