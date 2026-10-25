const axios = require('axios');

/**
 * Lightweight HTTP clients for downstream services.
 * Each call forwards the X-Request-Id correlation header and applies a timeout.
 */
function createServiceClients({ inventoryUrl, paymentUrl, notificationUrl, timeoutMs }) {
  function headers(requestId) {
    return { 'X-Request-Id': requestId, 'Content-Type': 'application/json' };
  }

  const inventory = {
    /**
     * Reserve stock for an order.
     * POST /api/v1/reservations
     */
    async reserveStock({ productId, qty, orderId }, requestId) {
      const res = await axios.post(
        `${inventoryUrl}/api/v1/reservations`,
        { productId, qty, orderId },
        { timeout: timeoutMs, headers: headers(requestId) },
      );
      return res.data; // { reservationId, ... }
    },

    /**
     * Release a reservation (compensation step).
     * POST /api/v1/reservations/:id/release
     */
    async releaseReservation(reservationId, requestId) {
      const res = await axios.post(
        `${inventoryUrl}/api/v1/reservations/${reservationId}/release`,
        {},
        { timeout: timeoutMs, headers: headers(requestId) },
      );
      return res.data;
    },

    /**
     * Confirm a reservation after payment succeeds.
     * POST /api/v1/reservations/:id/confirm
     */
    async confirmReservation(reservationId, requestId) {
      const res = await axios.post(
        `${inventoryUrl}/api/v1/reservations/${reservationId}/confirm`,
        {},
        { timeout: timeoutMs, headers: headers(requestId) },
      );
      return res.data;
    },
  };

  const payment = {
    /**
     * Charge the customer.
     * POST /api/v1/payments  (Idempotency-Key: pay-<orderId>)
     */
    async charge({ orderId, amount }, requestId) {
      const res = await axios.post(
        `${paymentUrl}/api/v1/payments`,
        { orderId, amount },
        {
          timeout: timeoutMs,
          headers: {
            ...headers(requestId),
            'Idempotency-Key': `pay-${orderId}`,
          },
        },
      );
      return res.data; // payment record
    },
  };

  const notification = {
    /**
     * Send a confirmation notification (fire-and-forget: failure is non-fatal).
     * POST /api/v1/notifications
     */
    async sendConfirmation({ orderId, customerId }, requestId) {
      const res = await axios.post(
        `${notificationUrl}/api/v1/notifications`,
        { orderId, type: 'ORDER_CONFIRMED', customerId },
        { timeout: timeoutMs, headers: headers(requestId) },
      );
      return res.data;
    },
  };

  return { inventory, payment, notification };
}

module.exports = createServiceClients;
