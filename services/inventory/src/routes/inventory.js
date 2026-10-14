const express = require('express');
const { z } = require('zod');
const repo = require('../repositories/inventoryRepository');

const router = express.Router();

// POST /api/v1/products
router.post('/products', async (req, res) => {
  const schema = z.object({
    sku:          z.string().min(1),
    name:         z.string().min(1),
    initialStock: z.number().int().nonnegative()
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: result.error.message } });
  }
  try {
    const product = await repo.createProduct(result.data);
    return res.status(201).json(product);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'DUPLICATE_SKU', message: 'SKU already exists' } });
    }
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// GET /api/v1/products/:id/stock
router.get('/products/:id/stock', async (req, res) => {
  const productId = parseInt(req.params.id);
  if (isNaN(productId)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Product ID must be a number' } });
  }
  const stock = await repo.getStock(productId);
  if (!stock) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }
  return res.json({ productId, ...stock });
});

// POST /api/v1/reservations
router.post('/reservations', async (req, res) => {
  const schema = z.object({
    orderId:   z.number().int().positive(),
    productId: z.number().int().positive(),
    qty:       z.number().int().positive()
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: result.error.message } });
  }
  const reservation = await repo.reserveStock(result.data);
  if (!reservation) {
    return res.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock available' } });
  }
  return res.status(201).json(reservation);
});

// POST /api/v1/reservations/:id/confirm
router.post('/reservations/:id/confirm', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Reservation ID must be a number' } });
  }
  const result = await repo.updateReservationStatus(id, 'CONFIRMED');
  if (result.error === 'NOT_FOUND') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
  }
  if (result.error === 'INVALID_TRANSITION') {
    return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'Can only confirm a RESERVED reservation' } });
  }
  return res.json(result.reservation);
});

// POST /api/v1/reservations/:id/release
router.post('/reservations/:id/release', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Reservation ID must be a number' } });
  }
  const result = await repo.updateReservationStatus(id, 'RELEASED');
  if (result.error === 'NOT_FOUND') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
  }
  if (result.error === 'INVALID_TRANSITION') {
    return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'Can only release a RESERVED reservation' } });
  }
  return res.json(result.reservation);
});

module.exports = router;