const config = require('./config');
const createLogger = require('./common/logger');
const { createDb } = require('./db');
const createNotificationsRepository = require('./repositories/notifications.repository');
const { createNotificationsService } = require('./services/notifications.service');
const { createApp } = require('./app');

const logger = createLogger('notification');

async function main() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL must be set (see .env.example)');
  const db = createDb(config.databaseUrl);
  await db.migrate(); // creates the table if it does not exist

  const service = createNotificationsService({ repo: createNotificationsRepository(db) });
  createApp({ service, logger }).listen(config.port, () => logger.info({ port: config.port }, 'notification listening'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
