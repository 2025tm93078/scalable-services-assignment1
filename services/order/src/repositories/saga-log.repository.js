/**
 * Repository for saga_log table.
 * Every saga step (started / succeeded / failed / compensated) is written here.
 * The rows are the primary evidence for Challenge 3C.
 */
function createSagaLogRepository(db) {
  async function append({ orderId, step, status, detail }, client) {
    const q = client || db;
    const { rows } = await q.query(
      `INSERT INTO saga_log (order_id, step, status, detail)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orderId, step, status, detail ? JSON.stringify(detail) : null],
    );
    return rows[0];
  }

  async function findByOrderId(orderId) {
    const { rows } = await db.query(
      'SELECT * FROM saga_log WHERE order_id = $1 ORDER BY created_at ASC',
      [orderId],
    );
    return rows;
  }

  return { append, findByOrderId };
}

module.exports = createSagaLogRepository;
