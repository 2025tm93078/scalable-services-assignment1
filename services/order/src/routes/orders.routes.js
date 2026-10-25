const express = require('express');
const { z } = require('zod');
const { AppError } = require('../common/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Input validation schemas ──────────────────────────────────────────────

const orderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  qty: z.number().int().positive('qty must be a positive integer'),
  price: z.number().nonnegative('price must be >= 0'),
});

const createOrderSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  items: z.array(orderItemSchema).min(1, 'at least one item is required'),
});

// ── Router factory ────────────────────────────────────────────────────────

module.exports = function ordersRoutes(service) {
  const router = express.Router();

  // POST /api/v1/orders — place an order (runs the full checkout saga)
  router.post('/', async (req, res, next) => {
    try {
      const body = createOrderSchema.parse(req.body);
      const order = await service.placeOrder({
        customerId: body.customerId,
        items: body.items,
        requestId: req.id,
      });
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  });

  // GET /api/v1/orders/:id — get order + items + saga log
  router.get('/:id', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        throw new AppError(400, 'INVALID_ID', 'Order id must be a valid UUID');
      }
      const order = await service.getOrder(req.params.id);
      res.json(order);
    } catch (e) {
      next(e);
    }
  });

  // POST /api/v1/orders/:id/cancel — manually cancel an order
  router.post('/:id/cancel', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        throw new AppError(400, 'INVALID_ID', 'Order id must be a valid UUID');
      }
      const order = await service.cancelOrder(req.params.id, req.id);
      res.json(order);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
