const pino = require('pino');

module.exports = function createLogger(serviceName) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: serviceName },
  });
};
