require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3003),
  databaseUrl: process.env.DATABASE_URL,
  gatewayUrl: process.env.GATEWAY_URL,
  gatewayTimeoutMs: Number(process.env.GATEWAY_TIMEOUT_MS || 4000),
  idempotencyWaitMs: Number(process.env.IDEMPOTENCY_WAIT_MS || 5000),
};
