const fs = require('fs');
const path = require('path');
const express = require('express');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const { requestId } = require('./common/middleware');
const { notFound, errorHandler } = require('./common/errors');
const notificationsRoutes = require('./routes/notifications.routes');

function createApp({ service, logger }) {
  const app = express();
  app.use(express.json());
  app.use(requestId(logger));

  app.get('/health', (req, res) => res.json({ service: 'notification', status: 'UP' }));

  const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use('/api/v1/notifications', notificationsRoutes(service));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
