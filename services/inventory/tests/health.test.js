const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

beforeEach(async () => {
  await pool.query('DELETE FROM reservations');
  await pool.query('DELETE FROM stock');
  await pool.query('DELETE FROM products');
});

afterAll(async () => {
  await pool.end();
});

async function createProduct(sku = 'TEST001', stock = 10) {
  const res = await request(app)
    .post('/api/v1/products')
    .send({ sku, name: 'Test Product', initialStock: stock });
  return res.body;
}

// BR1: Stock never goes below zero
describe('BR1 - Stock never goes below zero', () => {
  test('reservation fails when qty exceeds available stock', async () => {
    const product = await createProduct('BR1-001', 5);
    const res = await request(app)
      .post('/api/v1/reservations')
      .send({ orderId: 1, productId: product.id, qty: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('stock does not go negative after failed reservation', async () => {
    const product = await createProduct('BR1-002', 5);
    await request(app)
      .post('/api/v1/reservations')
      .send({ orderId: 1, productId: product.id, qty: 10 });
    const stock = await request(app).get(`/api/v1/products/${product.id}/stock`);
    expect(stock.body.available).toBe(5);
  });
});

// BR2: Reservation can only be confirmed or released from RESERVED
describe('BR2 - Invalid state transitions are rejected', () => {
  test('cannot release a CONFIRMED reservation', async () => {
    const product = await createProduct('BR2-001', 10);
    const resv = await request(app)
      .post('/api/v1/reservations')
      .send({ orderId: 1, productId: product.id, qty: 3 });
    await request(app).post(`/api/v1/reservations/${resv.body.id}/confirm`);
    const release = await request(app).post(`/api/v1/reservations/${resv.body.id}/release`);
    expect(release.status).toBe(409);
    expect(release.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('cannot confirm an already CONFIRMED reservation', async () => {
    const product = await createProduct('BR2-002', 10);
    const resv = await request(app)
      .post('/api/v1/reservations')
      .send({ orderId: 1, productId: product.id, qty: 3 });
    await request(app).post(`/api/v1/reservations/${resv.body.id}/confirm`);
    const confirm = await request(app).post(`/api/v1/reservations/${resv.body.id}/confirm`);
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('releasing twice does not restore stock twice', async () => {
    const product = await createProduct('BR2-003', 10);
    const resv = await request(app)
      .post('/api/v1/reservations')
      .send({ orderId: 1, productId: product.id, qty: 3 });
    await request(app).post(`/api/v1/reservations/${resv.body.id}/release`);
    await request(app).post(`/api/v1/reservations/${resv.body.id}/release`);
    const stock = await request(app).get(`/api/v1/products/${product.id}/stock`);
    expect(stock.body.available).toBe(10); // back to original, not 13
  });
});