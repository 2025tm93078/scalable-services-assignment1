// BR6: A notification is sent only for CONFIRMED orders.
const { createNotificationsService } = require('../src/services/notifications.service');

function makeService() {
  const rows = [];
  const repo = {
    insert: jest.fn(async (n) => { const row = { id: `n-${rows.length + 1}`, ...n }; rows.push(row); return row; }),
    findByOrderId: jest.fn(async () => rows),
  };
  return { service: createNotificationsService({ repo }), repo, rows };
}

describe('BR6 - notify only CONFIRMED orders', () => {
  test('CONFIRMED order -> notification stored with status SENT', async () => {
    const { service, rows } = makeService();
    const n = await service.send({ orderId: 'o1', type: 'ORDER_CONFIRMED', orderStatus: 'CONFIRMED' });
    expect(n.status).toBe('SENT');
    expect(rows).toHaveLength(1);
  });

  test.each(['PENDING', 'STOCK_RESERVED', 'PAID', 'CANCELLED'])('%s order -> rejected with 422, nothing stored', async (status) => {
    const { service, repo } = makeService();
    await expect(service.send({ orderId: 'o1', type: 'ORDER_CONFIRMED', orderStatus: status }))
      .rejects.toMatchObject({ status: 422, code: 'ORDER_NOT_CONFIRMED' });
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
