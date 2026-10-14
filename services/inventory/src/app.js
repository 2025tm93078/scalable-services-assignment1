require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const inventoryRoutes = require('./routes/inventory');

const app = express();
app.use(express.json());

const swaggerDoc = yaml.load(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.get('/health', (req, res) => {
  res.json({ service: 'inventory', status: 'UP' });
});

app.use('/api/v1', inventoryRoutes);

module.exports = app;