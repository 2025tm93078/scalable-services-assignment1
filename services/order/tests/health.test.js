const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../src/app');

// Minimal stub service so createApp doesn't need a real DB
const stubService = {
  placeOrder: jest.fn(),
  getOrder: jest.fn(),
  cancelOrder: jest.fn(),
};

const app = createApp({ service: stubService, logger: pino({ level: 'silent' }) });

test('GET /health returns UP', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('UP');
});
