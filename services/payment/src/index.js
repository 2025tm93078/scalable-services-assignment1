const config = require('./config');
const createLogger = require('./common/logger');
const { createDb } = require('./db');
const createIdempotencyRepository = require('./repositories/idempotency.repository');
const createPaymentsRepository = require('./repositories/payments.repository');
const createGatewayClient = require('./services/gateway.client');
const { createPaymentsService } = require('./services/payments.service');
const { createApp } = require('./app');

const logger = createLogger('payment');

async function main() {
  if (!config.databaseUrl || !config.gatewayUrl) {
    throw new Error('DATABASE_URL and GATEWAY_URL must be set (see .env.example)');
  }
  const db = createDb(config.databaseUrl);
  await db.migrate(); // creates tables if they do not exist

  const service = createPaymentsService({
    idempotencyRepo: createIdempotencyRepository(db),
    paymentsRepo: createPaymentsRepository(db),
    gateway: createGatewayClient({ baseUrl: config.gatewayUrl, timeoutMs: config.gatewayTimeoutMs }),
    db,
    waitMs: config.idempotencyWaitMs,
  });

  createApp({ service, logger }).listen(config.port, () => logger.info({ port: config.port }, 'payment listening'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
