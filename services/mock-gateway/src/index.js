require('dotenv').config();
const express = require('express');
const { z } = require('zod');
const createLogger = require('./common/logger');
const { requestId } = require('./common/middleware');
const { notFound, errorHandler } = require('./common/errors');

const logger = createLogger('mock-gateway');
const app = express();
app.use(express.json());
app.use(requestId(logger));

// Runtime-controllable behaviour (config comes from env, can be changed live for demos)
const state = {
  latencyMs: Number(process.env.LATENCY_MS || 300),
  failRate: Number(process.env.FAIL_RATE || 0),
  mode: 'off', // off | always (declines every charge) | error (HTTP 500 on every charge)
  chargesAccepted: 0,
  chargesDeclined: 0,
  chargesErrored: 0,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.get('/health', (req, res) => res.json({ service: 'mock-gateway', status: 'UP' }));

// The "payment provider" endpoint
app.post('/api/v1/charge', async (req, res, next) => {
  try {
    const body = z.object({ orderId: z.string().min(1), amount: z.number().positive() }).parse(req.body);
    await sleep(state.latencyMs);

    if (state.mode === 'error') {
      state.chargesErrored += 1;
      req.log.warn({ orderId: body.orderId }, 'gateway simulating internal error');
      return res.status(500).json({ ok: false, reason: 'Gateway internal error (simulated)' });
    }
    if (state.mode === 'always' || Math.random() < state.failRate) {
      state.chargesDeclined += 1;
      req.log.warn({ orderId: body.orderId }, 'gateway declined charge');
      return res.status(402).json({ ok: false, reason: 'Card declined (simulated)' });
    }
    state.chargesAccepted += 1;
    const ref = `gw_${Math.random().toString(36).slice(2, 10)}`;
    req.log.info({ orderId: body.orderId, ref, amount: body.amount }, 'gateway accepted charge');
    return res.json({ ok: true, ref });
  } catch (e) {
    return next(e);
  }
});

// ---- Admin switches (used by demos and by Person 2's saga failure test) ----
app.get('/admin/state', (req, res) => res.json(state));
app.get('/admin/fail-mode', (req, res) => res.json({ mode: state.mode }));
app.post('/admin/fail-mode', (req, res, next) => {
  try {
    const { mode } = z.object({ mode: z.enum(['off', 'always', 'error']) }).parse(req.body);
    state.mode = mode;
    req.log.info({ mode }, 'fail-mode changed');
    res.json({ mode });
  } catch (e) { next(e); }
});
app.post('/admin/latency', (req, res, next) => {
  try {
    const { ms } = z.object({ ms: z.number().int().min(0).max(60000) }).parse(req.body);
    state.latencyMs = ms;
    res.json({ latencyMs: ms });
  } catch (e) { next(e); }
});
app.post('/admin/reset', (req, res) => {
  state.mode = 'off';
  state.chargesAccepted = 0;
  state.chargesDeclined = 0;
  state.chargesErrored = 0;
  res.json(state);
});

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 3005);
if (require.main === module) {
  app.listen(port, () => logger.info({ port }, 'mock-gateway listening'));
}
module.exports = app;
