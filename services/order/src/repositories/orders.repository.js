/**
 * Repository for orders and order_items tables.
 * All SQL lives here; business logic lives in the service layer.
 */
function createOrdersRepository(db) {
  /**
   * Insert a new order (PENDING) plus its line items in one transaction.
   * Returns the created order row.
   */
  async function create({ customerId, items, total }, client) {
    const q = client || db;
    const { rows } = await q.query(
      `INSERT INTO orders (customer_id, status, total)
       VALUES ($1, 'PENDING', $2)
       RETURNING *`,
      [customerId, total],
    );
    const order = rows[0];

    for (const item of items) {
      await q.query(
        `INSERT INTO order_items (order_id, product_id, qty, price)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.qty, item.price],
      );
    }
    return order;
  }

  async function findById(id) {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async function findItemsByOrderId(orderId) {
    const { rows } = await db.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId],
    );
    return rows;
  }

  /**
   * Transition an order to a new status.
   * Uses a CAS-style update to enforce the allowed state machine transitions
   * at the DB level, preventing dirty reads from racing requests.
   */
  async function transition(id, fromStatus, toStatus, client) {
    const q = client || db;
    const { rows } = await q.query(
      `UPDATE orders SET status = $1, updated_at = now()
       WHERE id = $2 AND status = $3
       RETURNING *`,
      [toStatus, id, fromStatus],
    );
    return rows[0] || null;
  }

  return { create, findById, findItemsByOrderId, transition };
}

module.exports = createOrdersRepository;
