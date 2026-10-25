const config = require('./config');
const createLogger = require('./common/logger');
const { createDb } = require('./db');
const createOrdersRepository = require('./repositories/orders.repository');
const createSagaLogRepository = require('./repositories/saga-log.repository');
const createServiceClients = require('./services/service-clients');
const { createOrdersService } = require('./services/orders.service');
const { createApp } = require('./app');

const logger = createLogger('order');

async function main() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL must be set (see .env.example)');
  }

  const db = createDb(config.databaseUrl);
  await db.migrate(); // creates tables from schema.sql if they do not exist

  const clients = createServiceClients({
    inventoryUrl: config.inventoryUrl,
    paymentUrl: config.paymentUrl,
    notificationUrl: config.notificationUrl,
    timeoutMs: config.serviceTimeoutMs,
  });

  const service = createOrdersService({
    ordersRepo: createOrdersRepository(db),
    sagaRepo: createSagaLogRepository(db),
    clients,
    log: logger,
  });

  createApp({ service, logger }).listen(config.port, () =>
    logger.info({ port: config.port }, 'order service listening'),
  );
}

main().catch((err) => {
  logger.error({ err }, 'failed to start order service');
  process.exit(1);
});
