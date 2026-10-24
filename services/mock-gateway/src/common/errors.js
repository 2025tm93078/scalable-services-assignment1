const { ZodError } = require('zod');

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// One error format everywhere: { error: { code, message, requestId } }
function errorBody(code, message, requestId) {
  return { error: { code, message, requestId } };
}

function notFound(req, res) {
  res.status(404).json(errorBody('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`, req.id));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const log = req.log || console;
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return res.status(400).json(errorBody('VALIDATION_ERROR', msg, req.id));
  }
  if (err instanceof AppError) {
    log.warn({ code: err.code, status: err.status }, err.message);
    return res.status(err.status).json(errorBody(err.code, err.message, req.id));
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('INVALID_JSON', 'Request body is not valid JSON', req.id));
  }
  log.error({ err }, 'unhandled error');
  return res.status(500).json(errorBody('INTERNAL_ERROR', 'Unexpected error', req.id));
}

module.exports = { AppError, errorBody, notFound, errorHandler };
