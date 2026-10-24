// API-level checks (validation, headers, error format) using supertest with a stub service.
const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../src/app');
const { AppError } = require('../src/common/errors');

const service = {
  charge: jest.fn(async () => ({ status: 201, body: { id: 'x', status: 'SUCCESS' }, replayed: false })),
  getById: jest.fn(async () => null),
  listByOrder: jest.fn(async () => []),
};
const app = createApp({ service, logger: pino({ level: 'silent' }) });

describe('Payment API', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
  });

  test('missing Idempotency-Key -> 400 in the standard error format', async () => {
    const res = await request(app).post('/api/v1/payments').send({ orderId: 'o1', amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    expect(res.body.error.requestId).toBeDefined();
  });

  test('invalid amount -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/payments').set('Idempotency-Key', 'k').send({ orderId: 'o1', amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('valid request -> 201 and Idempotency-Replayed header', async () => {
    const res = await request(app).post('/api/v1/payments').set('Idempotency-Key', 'k').send({ orderId: 'o1', amount: 10 });
    expect(res.status).toBe(201);
    expect(res.headers['idempotency-replayed']).toBe('false');
  });

  test('X-Request-Id is propagated back', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  test('service AppError is mapped to its status', async () => {
    service.charge.mockRejectedValueOnce(new AppError(504, 'GATEWAY_TIMEOUT', 'down'));
    const res = await request(app).post('/api/v1/payments').set('Idempotency-Key', 'k').send({ orderId: 'o1', amount: 10 });
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('GATEWAY_TIMEOUT');
  });

  test('unknown payment id -> 404', async () => {
    const res = await request(app).get('/api/v1/payments/not-a-uuid');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });
});
