require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3002),
  databaseUrl: process.env.DATABASE_URL,
  inventoryUrl: process.env.INVENTORY_URL || 'http://localhost:3001',
  paymentUrl: process.env.PAYMENT_URL || 'http://localhost:3003',
  notificationUrl: process.env.NOTIFICATION_URL || 'http://localhost:3004',
  serviceTimeoutMs: Number(process.env.SERVICE_TIMEOUT_MS || 5000),
};
