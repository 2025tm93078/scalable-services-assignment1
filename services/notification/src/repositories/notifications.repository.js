const map = (r) => ({ id: r.id, orderId: r.order_id, type: r.type, status: r.status, createdAt: r.created_at });

module.exports = function createNotificationsRepository(db) {
  return {
    async insert({ orderId, type, status }) {
      const r = await db.query(
        'INSERT INTO notifications (order_id, type, status) VALUES ($1, $2, $3) RETURNING *',
        [orderId, type, status],
      );
      return map(r.rows[0]);
    },
    async findByOrderId(orderId) {
      const r = await db.query('SELECT * FROM notifications WHERE order_id = $1 ORDER BY created_at', [orderId]);
      return r.rows.map(map);
    },
  };
};
