// BR5: The same Idempotency-Key never produces two charges.
// Unit tests use in-memory fakes; the fake tryInsert is atomic like the DB PRIMARY KEY.
const { createPaymentsService } = require('../src/services/payments.service');

function makeFakes({ gatewayImpl } = {}) {
  const keys = new Map();
  const payments = [];
  const idempotencyRepo = {
    tryInsert: async (key, requestHash) => {
      if (keys.has(key)) return false;
      keys.set(key, { key, requestHash, state: 'IN_PROGRESS' });
      return true;
    },
    find: async (key) => (keys.has(key) ? { ...keys.get(key) } : null),
    complete: async (key, statusCode, responseBody) => {
      Object.assign(keys.get(key), { state: 'DONE', statusCode, responseBody });
    },
    remove: async (key) => { keys.delete(key); },
  };
  const paymentsRepo = {
    insert: async (p) => {
      const row = { id: `pay-${payments.length + 1}`, ...p };
      payments.push(row);
      return row;
    },
    findById: async () => null,
    findByOrderId: async () => [],
  };
  const gateway = {
    charge: jest.fn(gatewayImpl || (async () => {
      await new Promise((r) => setTimeout(r, 30)); // simulate latency so concurrent calls overlap
      return { ok: true, ref: 'gw_test' };
    })),
  };
  const db = { tx: async (fn) => fn(null) };
  const service = createPaymentsService({ idempotencyRepo, paymentsRepo, gateway, db, waitMs: 1000, pollMs: 10 });
  return { service, gateway, payments, keys };
}

const body = { orderId: 'order-1', amount: 100 };

describe('BR5 - idempotent charge', () => {
  test('first request charges once and returns 201', async () => {
    const { service, gateway, payments } = makeFakes();
    const r = await service.charge({ key: 'k1', body, requestId: 'r1' });
    expect(r.status).toBe(201);
    expect(r.replayed).toBe(false);
    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
  });

  test('same key + same body replays the stored response, no second charge', async () => {
    const { service, gateway, payments } = makeFakes();
    const first = await service.charge({ key: 'k1', body, requestId: 'r1' });
    const second = await service.charge({ key: 'k1', body, requestId: 'r2' });
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
  });

  test('same key + different body is rejected with 422', async () => {
    const { service, gateway } = makeFakes();
    await service.charge({ key: 'k1', body, requestId: 'r1' });
    await expect(service.charge({ key: 'k1', body: { ...body, amount: 999 }, requestId: 'r2' }))
      .rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(gateway.charge).toHaveBeenCalledTimes(1);
  });

  test('two identical requests at the same moment produce exactly one charge', async () => {
    const { service, gateway, payments } = makeFakes();
    const [a, b] = await Promise.all([
      service.charge({ key: 'k1', body, requestId: 'r1' }),
      service.charge({ key: 'k1', body, requestId: 'r2' }),
    ]);
    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
    expect(a.body.id).toBe(b.body.id);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });

  test('declined payment is stored and replayed (not charged again)', async () => {
    const { service, gateway } = makeFakes({ gatewayImpl: async () => ({ ok: false, reason: 'Card declined' }) });
    const first = await service.charge({ key: 'k1', body, requestId: 'r1' });
    const second = await service.charge({ key: 'k1', body, requestId: 'r2' });
    expect(first.status).toBe(422);
    expect(second.status).toBe(422);
    expect(second.replayed).toBe(true);
    expect(gateway.charge).toHaveBeenCalledTimes(1);
  });

  test('gateway timeout returns 504 and frees the key so a retry can succeed', async () => {
    let calls = 0;
    const { service, gateway } = makeFakes({
      gatewayImpl: async () => { calls += 1; if (calls === 1) throw new Error('timeout'); return { ok: true, ref: 'gw_ok' }; },
    });
    await expect(service.charge({ key: 'k1', body, requestId: 'r1' }))
      .rejects.toMatchObject({ status: 504, code: 'GATEWAY_TIMEOUT' });
    const retry = await service.charge({ key: 'k1', body, requestId: 'r2' });
    expect(retry.status).toBe(201);
    expect(gateway.charge).toHaveBeenCalledTimes(2);
  });
});
