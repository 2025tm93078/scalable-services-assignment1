const { randomUUID } = require('crypto');

// Correlation ID: reuse X-Request-Id if present, otherwise generate one.
// Every log line for this request carries it (req.log is a child logger).
function requestId(logger) {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    req.log = logger.child({ requestId: req.id });
    req.log.info({ method: req.method, path: req.originalUrl }, 'request received');
    res.on('finish', () => req.log.info({ status: res.statusCode }, 'request completed'));
    next();
  };
}

module.exports = { requestId };
