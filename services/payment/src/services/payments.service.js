const crypto = require('crypto');
const { AppError } = require('../common/errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fingerprint of the request: same fields in any key order -> same hash
function hashBody(body) {
  const sorted = Object.keys(body).sort().reduce((o, k) => { o[k] = body[k]; return o; }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/**
 * BR5: the same Idempotency-Key never produces two charges.
 * All business logic for payments lives here; dependencies are injected so it can be unit-tested.
 */
function createPaymentsService({ idempotencyRepo, paymentsRepo, gateway, db, waitMs = 5000, pollMs = 100 }) {
  // A request whose key already exists: replay, reject, or wait for the first request to finish
  async function handleExistingKey(key, hash) {
    let row = await idempotencyRepo.find(key);
    if (row && row.requestHash !== hash) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request payload');
    }
    // Same payload, first request still running: wait briefly so we can return the same result
    const deadline = Date.now() + waitMs;
    while (row && row.state === 'IN_PROGRESS' && Date.now() < deadline) {
      await sleep(pollMs);
      row = await idempotencyRepo.find(key);
    }
    if (!row) {
      throw new AppError(409, 'REQUEST_FAILED_RETRY', 'The first attempt failed before completing; please retry');
    }
    if (row.state === 'DONE') {
      return { status: row.statusCode, body: row.responseBody, replayed: true };
    }
    throw new AppError(409, 'REQUEST_IN_PROGRESS', 'An identical request is still being processed');
  }

  async function charge({ key, body, requestId, log }) {
    const hash = hashBody(body);

    // Only ONE concurrent caller can win this insert (PRIMARY KEY on key)
    const won = await idempotencyRepo.tryInsert(key, hash);
    if (!won) {
      log && log.info({ key }, 'idempotency key already seen: replay path');
      return handleExistingKey(key, hash);
    }

    // We are the single winner: talk to the payment provider
    let gw;
    try {
      gw = await gateway.charge(body, requestId);
    } catch (err) {
      // Timeout / 5xx: nothing was recorded, free the key so the caller may retry safely
      await idempotencyRepo.remove(key);
      log && log.error({ key, err: err.message }, 'gateway call failed; idempotency key released');
      throw new AppError(504, 'GATEWAY_TIMEOUT', 'Payment gateway unavailable or too slow');
    }

    // Save payment and the stored response together (one DB transaction)
    return db.tx(async (client) => {
      const payment = await paymentsRepo.insert({
        orderId: body.orderId,
        amount: body.amount,
        status: gw.ok ? 'SUCCESS' : 'FAILED',
        gatewayRef: gw.ok ? gw.ref : null,
      }, client);

      const status = gw.ok ? 201 : 422;
      const responseBody = gw.ok
        ? payment
        : { error: { code: 'PAYMENT_DECLINED', message: gw.reason, requestId } };

      await idempotencyRepo.complete(key, status, responseBody, client);
      log && log.info({ key, paymentId: payment.id, status: payment.status }, 'payment processed and response stored');
      return { status, body: responseBody, replayed: false };
    });
  }

  return {
    charge,
    getById: (id) => paymentsRepo.findById(id),
    listByOrder: (orderId) => paymentsRepo.findByOrderId(orderId),
  };
}

module.exports = { createPaymentsService, hashBody };
