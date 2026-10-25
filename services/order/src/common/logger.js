const pino = require('pino');

function createLogger(service) {
  return pino({ base: { service } });
}

module.exports = createLogger;
