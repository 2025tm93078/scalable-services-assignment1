const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../src/app');
const { createNotificationsService } = require('../src/services/notifications.service');

const repo = {
  insert: async (n) => ({ id: 'n1', createdAt: new Date().toISOString(), ...n }),
  findByOrderId: async () => [],
};
const app = createApp({ service: createNotificationsService({ repo }), logger: pino({ level: 'silent' }) });

describe('Notification API', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('CONFIRMED -> 201', async () => {
    const res = await request(app).post('/api/v1/notifications').send({ orderId: 'o1', orderStatus: 'CONFIRMED' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('ORDER_CONFIRMED');
  });

  test('not CONFIRMED -> 422 in the standard error format', async () => {
    const res = await request(app).post('/api/v1/notifications').send({ orderId: 'o1', orderStatus: 'PAID' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_NOT_CONFIRMED');
    expect(res.body.error.requestId).toBeDefined();
  });

  test('missing orderId -> 400', async () => {
    const res = await request(app).post('/api/v1/notifications').send({ orderStatus: 'CONFIRMED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
