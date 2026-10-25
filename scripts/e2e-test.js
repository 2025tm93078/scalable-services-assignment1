#!/usr/bin/env node
/**
 * scripts/e2e-test.js  —  End-to-End Happy Path Test (Person 2)
 * ───────────────────────────────────────────────────────────────
 * Tests the full checkout saga in order:
 *   1. Create a product in Inventory
 *   2. Place an order  → POST /api/v1/orders
 *   3. Verify order is CONFIRMED
 *   4. Verify stock was reduced
 *   5. Verify reservation is CONFIRMED
 *   6. Verify payment record exists
 *   7. Verify notification was sent
 *   8. Verify saga log shows all steps SUCCEEDED
 *
 * Requires Node 18+. No extra dependencies (uses built-in fetch).
 *
 * Usage:
 *   node scripts/e2e-test.js
 *
 * Env overrides:
 *   ORDER_URL        (default: http://localhost:3002)
 *   INVENTORY_URL    (default: http://localhost:3001)
 *   PAYMENT_URL      (default: http://localhost:3003)
 *   NOTIFICATION_URL (default: http://localhost:3004)
 *   GATEWAY_URL      (default: http://localhost:3005)
 */

'use strict';

const ORDER_URL        = process.env.ORDER_URL        || 'http://localhost:3002';
const INVENTORY_URL    = process.env.INVENTORY_URL    || 'http://localhost:3001';
const PAYMENT_URL      = process.env.PAYMENT_URL      || 'http://localhost:3003';
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || 'http://localhost:3004';
const GATEWAY_URL      = process.env.GATEWAY_URL      || 'http://localhost:3005';

const now     = () => new Date().toISOString();
const log     = (msg) => console.log(`[${now()}] ${msg}`);
const divider = (t)   => console.log(`\n${'─'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`);

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    log(`  ✔ PASS  ${name}`);
  } else {
    failed++;
    log(`  ✘ FAIL  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function req(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  };
  const res  = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

const get  = (url)       => req('GET',  url);
const post = (url, body) => req('POST', url, body);

// ── Health-check helper ───────────────────────────────────────────────────────

async function healthCheck(name, url) {
  try {
    const r = await get(`${url}/health`);
    if (r.status === 200 && r.body.status === 'UP') {
      log(`  ✔ ${name} is UP  (${url})`);
      return true;
    }
    log(`  ✘ ${name} health check failed: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    return false;
  } catch (e) {
    log(`  ✘ ${name} unreachable: ${e.message}`);
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  divider('E2E Test — Full Checkout Happy Path');
  log(`Order:        ${ORDER_URL}`);
  log(`Inventory:    ${INVENTORY_URL}`);
  log(`Payment:      ${PAYMENT_URL}`);
  log(`Notification: ${NOTIFICATION_URL}`);
  log(`Gateway:      ${GATEWAY_URL}`);

  // ── Step 0: Health checks ─────────────────────────────────────────────────
  divider('Step 0 — Health checks');
  const healthy = await Promise.all([
    healthCheck('Inventory',    INVENTORY_URL),
    healthCheck('Order',        ORDER_URL),
    healthCheck('Payment',      PAYMENT_URL),
    healthCheck('Notification', NOTIFICATION_URL),
    healthCheck('MockGateway',  GATEWAY_URL),
  ]);
  if (healthy.some((h) => !h)) {
    log('\nERROR: One or more services are not reachable. Start all services and retry.');
    process.exit(1);
  }

  // Reset gateway counters before the test
  await post(`${GATEWAY_URL}/admin/reset`);
  await post(`${GATEWAY_URL}/admin/latency`, { ms: 100 });
  log('  Gateway reset and latency set to 100 ms.');

  // ── Step 1: Create a product ──────────────────────────────────────────────
  divider('Step 1 — Create a product in Inventory');
  const sku        = `E2E-${Date.now()}`;
  const initStock  = 10;
  const orderQty   = 3;
  const unitPrice  = 29.99;
  const expectedTotal = +(orderQty * unitPrice).toFixed(2);

  const prodRes = await post(`${INVENTORY_URL}/api/v1/products`, {
    sku,
    name: `E2E Test Product (${sku})`,
    initialStock: initStock,
  });
  log(`  Response: HTTP ${prodRes.status}`);
  console.log(JSON.stringify(prodRes.body, null, 2));

  check('Product created (HTTP 201)',  prodRes.status === 201);
  check('Product has an id',           !!prodRes.body.id);
  const productId = prodRes.body.id;
  if (!productId) {
    log('Cannot continue without a product id.');
    process.exit(1);
  }

  // ── Step 2: Place an order ────────────────────────────────────────────────
  divider('Step 2 — Place an order (POST /api/v1/orders)');
  const orderRes = await post(`${ORDER_URL}/api/v1/orders`, {
    customerId: 'e2e-customer-1',
    items: [{ productId, qty: orderQty, price: unitPrice }],
  });
  log(`  Response: HTTP ${orderRes.status}`);
  console.log(JSON.stringify(orderRes.body, null, 2));

  check('Order created (HTTP 201)',    orderRes.status === 201);
  check('Order status is CONFIRMED',  orderRes.body.status === 'CONFIRMED');
  check(`Total equals ${expectedTotal}`, Number(orderRes.body.total) === expectedTotal);
  check('Order has an id',            !!orderRes.body.id);

  const orderId = orderRes.body.id;
  if (!orderId) {
    log('Cannot continue without an order id.');
    process.exit(1);
  }

  // ── Step 3: Verify order detail (GET /api/v1/orders/:id) ─────────────────
  divider('Step 3 — Verify order detail and saga log');
  const detailRes = await get(`${ORDER_URL}/api/v1/orders/${orderId}`);
  log(`  Response: HTTP ${detailRes.status}`);
  console.log(JSON.stringify(detailRes.body, null, 2));

  const order     = detailRes.body;
  const sagaSteps = order.sagaSteps || [];
  const stepNames = sagaSteps.map((s) => `${s.step}:${s.status}`);

  check('GET /orders/:id returns 200',              detailRes.status === 200);
  check('Order status is CONFIRMED',                order.status === 'CONFIRMED');
  check('Items array is present',                   Array.isArray(order.items) && order.items.length > 0);
  check('Saga log is present',                      sagaSteps.length > 0);
  check('RESERVE_STOCK:SUCCEEDED in saga log',      stepNames.includes('RESERVE_STOCK:SUCCEEDED'));
  check('CHARGE_PAYMENT:SUCCEEDED in saga log',     stepNames.includes('CHARGE_PAYMENT:SUCCEEDED'));
  check('CONFIRM_ORDER:SUCCEEDED in saga log',      stepNames.includes('CONFIRM_ORDER:SUCCEEDED'));
  check('No FAILED steps in saga log',              !stepNames.some((s) => s.endsWith(':FAILED')));

  log('\n  Saga steps:');
  sagaSteps.forEach((s) => {
    const detail = s.detail ? JSON.stringify(s.detail) : '';
    log(`    ${s.step.padEnd(24)} ${s.status.padEnd(12)} ${detail}`);
  });

  // ── Step 4: Verify stock was reduced ─────────────────────────────────────
  divider('Step 4 — Verify stock was reduced in Inventory');
  const stockRes = await get(`${INVENTORY_URL}/api/v1/products/${productId}/stock`);
  log(`  Response: HTTP ${stockRes.status}  ${JSON.stringify(stockRes.body)}`);

  const expectedStock = initStock - orderQty;
  check(`Stock reduced to ${expectedStock}`, Number(stockRes.body.available) === expectedStock);

  // ── Step 5: Verify reservation is CONFIRMED ───────────────────────────────
  divider('Step 5 — Verify reservation status in Inventory');
  // Extract reservationId from saga log
  const reserveStep  = sagaSteps.find((s) => s.step === 'RESERVE_STOCK' && s.status === 'SUCCEEDED');
  const reservationId = reserveStep?.detail?.reservationId;
  if (reservationId) {
    log(`  Reservation id: ${reservationId}`);
    // Inventory GET endpoint for a single reservation (if available)
    const resRes = await get(`${INVENTORY_URL}/api/v1/reservations/${reservationId}`);
    log(`  Response: HTTP ${resRes.status}  ${JSON.stringify(resRes.body)}`);
    if (resRes.status === 200) {
      check('Reservation status is CONFIRMED', resRes.body.status === 'CONFIRMED');
    } else {
      log('  (GET /reservations/:id not available — skipping reservation status check)');
    }
  } else {
    log('  (reservationId not in saga log detail — skipping reservation check)');
  }

  // ── Step 6: Verify payment record ────────────────────────────────────────
  divider('Step 6 — Verify payment record in Payment service');
  const payRes = await get(`${PAYMENT_URL}/api/v1/payments?orderId=${orderId}`);
  log(`  Response: HTTP ${payRes.status}`);
  console.log(JSON.stringify(payRes.body, null, 2));

  const payments = payRes.body.payments || [];
  check('Payment endpoint returned 200',     payRes.status === 200);
  check('Exactly 1 payment record',          payments.length === 1);
  check('Payment status is SUCCESS',         payments[0]?.status === 'SUCCESS');
  check('Payment amount matches order total', Number(payments[0]?.amount) === expectedTotal);

  // ── Step 7: Verify notification ───────────────────────────────────────────
  divider('Step 7 — Verify notification was stored');
  // Notification service stores a record per order
  const notifRes = await get(`${NOTIFICATION_URL}/api/v1/notifications?orderId=${orderId}`);
  log(`  Response: HTTP ${notifRes.status}`);
  console.log(JSON.stringify(notifRes.body, null, 2));

  if (notifRes.status === 200) {
    const notifs = notifRes.body.notifications || notifRes.body || [];
    const arr    = Array.isArray(notifs) ? notifs : [notifs];
    check('At least 1 notification record for the order', arr.length >= 1);
    check('Notification type is ORDER_CONFIRMED',
      arr.some((n) => n.type === 'ORDER_CONFIRMED'));
  } else {
    log('  (Notification GET not available or returned non-200 — skipping)');
  }

  // ── Step 8: Verify gateway called exactly once ────────────────────────────
  divider('Step 8 — Verify gateway was called exactly once');
  const gwState = await get(`${GATEWAY_URL}/admin/state`);
  log(`  Gateway state: ${JSON.stringify(gwState.body)}`);
  check('Gateway accepted exactly 1 charge', gwState.body.chargesAccepted === 1);
  check('Gateway declined 0 charges',        gwState.body.chargesDeclined === 0);

  // ── Final summary ─────────────────────────────────────────────────────────
  const total = passed + failed;
  divider(failed === 0
    ? `✔  ALL ${total} CHECKS PASSED`
    : `✘  ${failed} of ${total} CHECK(S) FAILED`);

  log(`  Order id:   ${orderId}`);
  log(`  Product id: ${productId}`);
  log(`  Total:      ${expectedTotal}`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[${now()}] FATAL: ${err.message}`);
  process.exit(2);
});
