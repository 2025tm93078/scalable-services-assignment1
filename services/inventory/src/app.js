require('dotenv').config();
const express = require('express');
const inventoryRoutes = require('./routes/inventory');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'inventory', status: 'UP' });
});

app.use('/api/v1', inventoryRoutes);

module.exports = app;