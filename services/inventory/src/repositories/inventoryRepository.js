const pool = require('../db/pool');

async function createProduct({ sku, name, initialStock }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO products (sku, name) VALUES ($1, $2) RETURNING *',
      [sku, name]
    );
    const product = rows[0];
    await client.query(
      'INSERT INTO stock (product_id, available) VALUES ($1, $2)',
      [product.id, initialStock]
    );
    await client.query('COMMIT');
    return { ...product, available: initialStock };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getStock(productId) {
  const { rows } = await pool.query(
    'SELECT s.available, s.version FROM stock s WHERE s.product_id = $1',
    [productId]
  );
  return rows[0] || null;
}

async function reserveStock({ orderId, productId, qty }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Atomic: only succeeds if enough stock exists. No separate SELECT.
    const { rows } = await client.query(
      `UPDATE stock
          SET available = available - $1,
              version   = version + 1
        WHERE product_id = $2
          AND available  >= $1
        RETURNING available`,
      [qty, productId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null; // caller treats this as 409
    }
    const { rows: res } = await client.query(
      `INSERT INTO reservations (order_id, product_id, qty, status)
       VALUES ($1, $2, $3, 'RESERVED') RETURNING *`,
      [orderId, productId, qty]
    );
    await client.query('COMMIT');
    return res[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateReservationStatus(reservationId, newStatus) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM reservations WHERE id = $1 FOR UPDATE`,
      [reservationId]
    );
    if (rows.length === 0) return { error: 'NOT_FOUND' };
    const reservation = rows[0];
    if (reservation.status !== 'RESERVED') return { error: 'INVALID_TRANSITION' };

    if (newStatus === 'RELEASED') {
      await client.query(
        `UPDATE stock SET available = available + $1 WHERE product_id = $2`,
        [reservation.qty, reservation.product_id]
      );
    }
    const { rows: updated } = await client.query(
      `UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *`,
      [newStatus, reservationId]
    );
    await client.query('COMMIT');
    return { reservation: updated[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createProduct, getStock, reserveStock, updateReservationStatus };