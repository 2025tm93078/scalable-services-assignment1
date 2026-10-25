const { randomUUID } = require('crypto');

/**
 * Correlation ID middleware.
 * Reuses X-Request-Id if present, otherwise generates a new UUID.
 * Attaches req.id and a child logger req.log to every request.
 */
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
