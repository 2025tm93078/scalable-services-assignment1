const express = require('express');
const { z } = require('zod');

const sendSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  type: z.string().min(1).default('ORDER_CONFIRMED'),
  orderStatus: z.string().min(1, 'orderStatus is required'),
});

module.exports = function notificationsRoutes(service) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = sendSchema.parse(req.body);
      const notification = await service.send(body, req.log);
      res.status(201).json(notification);
    } catch (e) { next(e); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const orderId = z.string().min(1, 'orderId query parameter is required').parse(req.query.orderId);
      res.json({ notifications: await service.listByOrder(orderId) });
    } catch (e) { next(e); }
  });

  return router;
};
