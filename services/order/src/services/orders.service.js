const { AppError } = require('../common/errors');

/**
 * Allowed state machine transitions (BR3).
 * Only these moves are legal; everything else throws INVALID_STATE_TRANSITION.
 */
const ALLOWED_TRANSITIONS = {
  PENDING:        ['STOCK_RESERVED', 'CANCELLED'],
  STOCK_RESERVED: ['PAID', 'CANCELLED'],
  PAID:           ['CONFIRMED'],
  CONFIRMED:      [], // terminal
  CANCELLED:      [], // terminal
};

/**
 * BR3: Validate that a status transition is allowed.
 * Throws AppError(409) if the move is illegal.
 */
function assertTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', `Unknown order status: ${fromStatus}`);
  }
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      `Cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

/**
 * OrdersService: orchestrates the checkout saga.
 * Dependencies are injected so the service can be unit-tested without real HTTP / DB.
 */
function createOrdersService({ ordersRepo, sagaRepo, clients, log }) {
  // ─── helpers ──────────────────────────────────────────────────────────────

  async function safeTransition(orderId, from, to) {
    assertTransition(from, to);
    const updated = await ordersRepo.transition(orderId, from, to);
    if (!updated) {
      throw new AppError(409, 'CONCURRENT_MODIFICATION', `Order ${orderId} is no longer in ${from} state`);
    }
    return updated;
  }

  async function logStep(orderId, step, status, detail) {
    try {
      await sagaRepo.append({ orderId, step, status, detail });
    } catch (err) {
      // Saga log failure must never crash the main flow
      log && log.error({ err, orderId, step }, 'saga log write failed');
    }
  }

  // ─── placeOrder (the full saga) ────────────────────────────────────────────

  /**
   * Runs the checkout saga:
   *  1. Save order as PENDING
   *  2. Reserve stock  → STOCK_RESERVED  (compensation: release)
   *  3. Charge payment → PAID            (compensation: none; idempotency handles retries)
   *  4. Confirm order  → CONFIRMED
   *  5. Send notification (non-fatal)
   *
   * BR4: if step 3 fails, release the reservation and cancel the order.
   */
  async function placeOrder({ customerId, items, requestId }) {
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);

    // Step 0 — persist order
    const order = await ordersRepo.create({ customerId, items, total });
    await logStep(order.id, 'CREATE_ORDER', 'SUCCEEDED', { total, items });

    let reservationId;

    // ── Step 1: Reserve stock ──────────────────────────────────────────────
    await logStep(order.id, 'RESERVE_STOCK', 'STARTED', null);
    try {
      // For MVP we support a single product per order.
      // Multi-product: loop and collect reservationIds.
      const item = items[0];
      const reservation = await clients.inventory.reserveStock(
        { productId: item.productId, qty: item.qty, orderId: order.id },
        requestId,
      );
      reservationId = reservation.id || reservation.reservationId;
      await safeTransition(order.id, 'PENDING', 'STOCK_RESERVED');
      await logStep(order.id, 'RESERVE_STOCK', 'SUCCEEDED', { reservationId });
    } catch (err) {
      await logStep(order.id, 'RESERVE_STOCK', 'FAILED', { reason: err.message });
      await ordersRepo.transition(order.id, 'PENDING', 'CANCELLED');
      throw new AppError(
        err.response?.status === 409 ? 409 : 502,
        'STOCK_RESERVATION_FAILED',
        err.response?.data?.error?.message || 'Could not reserve stock',
      );
    }

    // ── Step 2: Charge payment ─────────────────────────────────────────────
    await logStep(order.id, 'CHARGE_PAYMENT', 'STARTED', null);
    try {
      const paymentResult = await clients.payment.charge({ orderId: order.id, amount: total }, requestId);
      await safeTransition(order.id, 'STOCK_RESERVED', 'PAID');
      await logStep(order.id, 'CHARGE_PAYMENT', 'SUCCEEDED', { paymentId: paymentResult.id });
    } catch (err) {
      // BR4: payment failed → compensate by releasing the stock reservation
      await logStep(order.id, 'CHARGE_PAYMENT', 'FAILED', { reason: err.message });

      await logStep(order.id, 'RELEASE_STOCK', 'STARTED', { reservationId });
      try {
        await clients.inventory.releaseReservation(reservationId, requestId);
        await logStep(order.id, 'RELEASE_STOCK', 'COMPENSATED', { reservationId });
      } catch (releaseErr) {
        log && log.error({ releaseErr, reservationId }, 'compensation: stock release failed — needs manual intervention');
        await logStep(order.id, 'RELEASE_STOCK', 'FAILED', { reason: releaseErr.message });
      }

      await ordersRepo.transition(order.id, 'STOCK_RESERVED', 'CANCELLED');
      throw new AppError(
        err.response?.status || 502,
        'PAYMENT_FAILED',
        err.response?.data?.error?.message || 'Payment could not be processed',
      );
    }

    // ── Step 3: Confirm order ──────────────────────────────────────────────
    await logStep(order.id, 'CONFIRM_ORDER', 'STARTED', null);
    await clients.inventory.confirmReservation(reservationId, requestId).catch((err) => {
      log && log.warn({ err, reservationId }, 'reservation confirm failed — stock stays reserved');
    });
    const confirmed = await safeTransition(order.id, 'PAID', 'CONFIRMED');
    await logStep(order.id, 'CONFIRM_ORDER', 'SUCCEEDED', null);

    // ── Step 4: Notify (non-fatal) ─────────────────────────────────────────
    await logStep(order.id, 'SEND_NOTIFICATION', 'STARTED', null);
    clients.notification
      .sendConfirmation({ orderId: order.id, customerId }, requestId)
      .then(() => logStep(order.id, 'SEND_NOTIFICATION', 'SUCCEEDED', null))
      .catch((err) => {
        log && log.warn({ err, orderId: order.id }, 'notification failed — order stays CONFIRMED');
        logStep(order.id, 'SEND_NOTIFICATION', 'FAILED', { reason: err.message });
      });

    return confirmed;
  }

  // ─── getOrder ─────────────────────────────────────────────────────────────

  async function getOrder(id) {
    const order = await ordersRepo.findById(id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${id} not found`);
    const items = await ordersRepo.findItemsByOrderId(id);
    const sagaSteps = await sagaRepo.findByOrderId(id);
    return { ...order, items, sagaSteps };
  }

  // ─── cancelOrder ──────────────────────────────────────────────────────────

  /**
   * Manual cancellation — only allowed from PENDING or STOCK_RESERVED.
   * If stock was reserved it will be released.
   */
  async function cancelOrder(id, requestId) {
    const order = await ordersRepo.findById(id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${id} not found`);
    if (['CONFIRMED', 'CANCELLED'].includes(order.status)) {
      throw new AppError(409, 'ORDER_NOT_CANCELLABLE', `Order in ${order.status} state cannot be cancelled`);
    }

    await logStep(id, 'CANCEL_ORDER', 'STARTED', null);

    // If stock was reserved, release it first
    if (order.status === 'STOCK_RESERVED') {
      const sagaSteps = await sagaRepo.findByOrderId(id);
      const reserveStep = sagaSteps.find((s) => s.step === 'RESERVE_STOCK' && s.status === 'SUCCEEDED');
      const reservationId = reserveStep?.detail?.reservationId;
      if (reservationId) {
        try {
          await clients.inventory.releaseReservation(reservationId, requestId);
          await logStep(id, 'RELEASE_STOCK', 'COMPENSATED', { reservationId });
        } catch (err) {
          log && log.error({ err, reservationId }, 'manual cancel: stock release failed');
          await logStep(id, 'RELEASE_STOCK', 'FAILED', { reason: err.message });
        }
      }
    }

    assertTransition(order.status, 'CANCELLED');
    const cancelled = await ordersRepo.transition(id, order.status, 'CANCELLED');
    await logStep(id, 'CANCEL_ORDER', 'SUCCEEDED', null);
    return cancelled;
  }

  return { placeOrder, getOrder, cancelOrder };
}

module.exports = { createOrdersService, assertTransition, ALLOWED_TRANSITIONS };
