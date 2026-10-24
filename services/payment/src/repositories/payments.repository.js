const map = (r) => ({
  id: r.id,
  orderId: r.order_id,
  amount: Number(r.amount),
  status: r.status,
  gatewayRef: r.gateway_ref,
  createdAt: r.created_at,
});

module.exports = function createPaymentsRepository(db) {
  return {
    async insert({ orderId, amount, status, gatewayRef }, client) {
      const q = client || db;
      const r = await q.query(
        `INSERT INTO payments (order_id, amount, status, gateway_ref)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [orderId, amount, status, gatewayRef || null],
      );
      return map(r.rows[0]);
    },

    async findById(id) {
      const r = await db.query('SELECT * FROM payments WHERE id = $1', [id]);
      return r.rows[0] ? map(r.rows[0]) : null;
    },

    async findByOrderId(orderId) {
      const r = await db.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at', [orderId]);
      return r.rows.map(map);
    },
  };
};
