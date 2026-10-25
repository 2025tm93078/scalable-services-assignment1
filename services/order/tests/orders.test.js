const { assertTransition, ALLOWED_TRANSITIONS, createOrdersService } = require('../src/services/orders.service');
const { AppError } = require('../src/common/errors');

// ─── BR3: State machine transitions ──────────────────────────────────────────

describe('BR3 – order state machine (assertTransition)', () => {
  test('PENDING → STOCK_RESERVED is allowed', () => {
    expect(() => assertTransition('PENDING', 'STOCK_RESERVED')).not.toThrow();
  });

  test('PENDING → CANCELLED is allowed', () => {
    expect(() => assertTransition('PENDING', 'CANCELLED')).not.toThrow();
  });

  test('STOCK_RESERVED → PAID is allowed', () => {
    expect(() => assertTransition('STOCK_RESERVED', 'PAID')).not.toThrow();
  });

  test('STOCK_RESERVED → CANCELLED is allowed', () => {
    expect(() => assertTransition('STOCK_RESERVED', 'CANCELLED')).not.toThrow();
  });

  test('PAID → CONFIRMED is allowed', () => {
    expect(() => assertTransition('PAID', 'CONFIRMED')).not.toThrow();
  });

  test('PENDING → PAID is NOT allowed', () => {
    expect(() => assertTransition('PENDING', 'PAID')).toThrow(AppError);
  });

  test('CONFIRMED → CANCELLED is NOT allowed (terminal state)', () => {
    expect(() => assertTransition('CONFIRMED', 'CANCELLED')).toThrow(AppError);
  });

  test('CANCELLED → any state is NOT allowed (terminal state)', () => {
    Object.keys(ALLOWED_TRANSITIONS).forEach((to) => {
      if (to !== 'CANCELLED') {
        expect(() => assertTransition('CANCELLED', to)).toThrow(AppError);
      }
    });
  });

  test('STOCK_RESERVED → CONFIRMED skips PAID and is NOT allowed', () => {
    expect(() => assertTransition('STOCK_RESERVED', 'CONFIRMED')).toThrow(AppError);
  });
});

// ─── BR4: Payment failure triggers compensation ───────────────────────────────

describe('BR4 – payment failure triggers stock release and order CANCELLED', () => {
  function makeService({ paymentShouldFail = true } = {}) {
    const sagaLog = [];

    const ordersRepo = {
      create: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING', total: 100 }),
      findById: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING' }),
      findItemsByOrderId: jest.fn().mockResolvedValue([]),
      transition: jest.fn().mockImplementation((_id, _from, toStatus) =>
        Promise.resolve({ id: 'order-1', status: toStatus }),
      ),
    };

    const sagaRepo = {
      append: jest.fn().mockImplementation(({ orderId, step, status, detail }) => {
        sagaLog.push({ orderId, step, status, detail });
        return Promise.resolve({});
      }),
      findByOrderId: jest.fn().mockResolvedValue(sagaLog),
    };

    const releaseReservation = jest.fn().mockResolvedValue({});
    const confirmReservation = jest.fn().mockResolvedValue({});

    const clients = {
      inventory: {
        reserveStock: jest.fn().mockResolvedValue({ id: 'res-1' }),
        releaseReservation,
        confirmReservation,
      },
      payment: {
        charge: paymentShouldFail
          ? jest.fn().mockRejectedValue(
              Object.assign(new Error('payment declined'), {
                response: { status: 422, data: { error: { message: 'Insufficient funds' } } },
              }),
            )
          : jest.fn().mockResolvedValue({ id: 'pay-1' }),
      },
      notification: {
        sendConfirmation: jest.fn().mockResolvedValue({}),
      },
    };

    const service = createOrdersService({
      ordersRepo,
      sagaRepo,
      clients,
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return { service, ordersRepo, sagaRepo, clients, sagaLog, releaseReservation };
  }

  test('BR4: payment failure → releaseReservation is called (stock compensation)', async () => {
    const { service, releaseReservation } = makeService({ paymentShouldFail: true });
    await expect(
      service.placeOrder({
        customerId: 'cust-1',
        items: [{ productId: 'prod-1', qty: 2, price: 50 }],
        requestId: 'req-1',
      }),
    ).rejects.toThrow(AppError);
    expect(releaseReservation).toHaveBeenCalledWith('res-1', 'req-1');
  });

  test('BR4: payment failure → order ends as CANCELLED', async () => {
    const { service, ordersRepo } = makeService({ paymentShouldFail: true });
    await expect(
      service.placeOrder({
        customerId: 'cust-1',
        items: [{ productId: 'prod-1', qty: 2, price: 50 }],
        requestId: 'req-1',
      }),
    ).rejects.toThrow(AppError);
    // transition to CANCELLED must have been called after STOCK_RESERVED
    expect(ordersRepo.transition).toHaveBeenCalledWith('order-1', 'STOCK_RESERVED', 'CANCELLED');
  });

  test('BR4: payment failure → saga log contains CHARGE_PAYMENT FAILED and RELEASE_STOCK COMPENSATED', async () => {
    const { service, sagaLog } = makeService({ paymentShouldFail: true });
    await expect(
      service.placeOrder({
        customerId: 'cust-1',
        items: [{ productId: 'prod-1', qty: 2, price: 50 }],
        requestId: 'req-1',
      }),
    ).rejects.toThrow();
    // Give fire-and-forget a tick to settle (not needed here, payment is sync)
    const steps = sagaLog.map((s) => `${s.step}:${s.status}`);
    expect(steps).toContain('CHARGE_PAYMENT:FAILED');
    expect(steps).toContain('RELEASE_STOCK:COMPENSATED');
  });

  test('BR4: successful payment → order ends as CONFIRMED, no compensation', async () => {
    const { service, releaseReservation, ordersRepo } = makeService({ paymentShouldFail: false });
    await service.placeOrder({
      customerId: 'cust-1',
      items: [{ productId: 'prod-1', qty: 2, price: 50 }],
      requestId: 'req-1',
    });
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(ordersRepo.transition).toHaveBeenCalledWith('order-1', 'PAID', 'CONFIRMED');
  });
});
