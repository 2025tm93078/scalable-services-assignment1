const fs = require('fs');
const path = require('path');
const express = require('express');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const { requestId } = require('./common/middleware');
const { notFound, errorHandler } = require('./common/errors');
const ordersRoutes = require('./routes/orders.routes');

function createApp({ service, logger }) {
  const app = express();
  app.use(express.json());
  app.use(requestId(logger));

  app.get('/health', (_req, res) => res.json({ service: 'order', status: 'UP' }));

  // OpenAPI docs
  const specPath = path.join(__dirname, '..', 'openapi.yaml');
  if (fs.existsSync(specPath)) {
    const spec = yaml.load(fs.readFileSync(specPath, 'utf8'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  }

  app.use('/api/v1/orders', ordersRoutes(service));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
