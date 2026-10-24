const { AppError } = require('../common/errors');

/**
 * BR6: a notification is sent only for CONFIRMED orders.
 * Order service tells us the order status in the request; we never read Order's database.
 */
function createNotificationsService({ repo }) {
  async function send({ orderId, type, orderStatus }, log) {
    if (orderStatus !== 'CONFIRMED') {
      throw new AppError(422, 'ORDER_NOT_CONFIRMED', `Notifications are only sent for CONFIRMED orders (got ${orderStatus})`);
    }
    // Mock provider: no real email/SMS, just log "sent" and store a record
    const notification = await repo.insert({ orderId, type, status: 'SENT' });
    log && log.info({ orderId, type, notificationId: notification.id }, 'notification sent (mock)');
    return notification;
  }

  return { send, listByOrder: (orderId) => repo.findByOrderId(orderId) };
}

module.exports = { createNotificationsService };
