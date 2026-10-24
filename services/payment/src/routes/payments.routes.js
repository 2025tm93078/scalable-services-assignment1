const express = require('express');
const { z } = require('zod');
const { AppError } = require('../common/errors');

const chargeSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  amount: z.number({ invalid_type_error: 'amount must be a number' }).positive('amount must be positive'),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function paymentsRoutes(service) {
  const router = express.Router();

  // Charge (requires Idempotency-Key)
  router.post('/', async (req, res, next) => {
    try {
      const key = req.header('Idempotency-Key');
      if (!key || key.length > 200) {
        throw new AppError(400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key header is required (max 200 chars)');
      }
      const body = chargeSchema.parse(req.body);
      const result = await service.charge({ key, body, requestId: req.id, log: req.log });
      res.set('Idempotency-Replayed', String(result.replayed));
      res.status(result.status).json(result.body);
    } catch (e) { next(e); }
  });

  // List payments of an order (used for evidence: shows a single row)
  router.get('/', async (req, res, next) => {
    try {
      const orderId = z.string().min(1, 'orderId query parameter is required').parse(req.query.orderId);
      res.json({ payments: await service.listByOrder(orderId) });
    } catch (e) { next(e); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const payment = UUID.test(req.params.id) ? await service.getById(req.params.id) : null;
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      res.json(payment);
    } catch (e) { next(e); }
  });

  return router;
};
