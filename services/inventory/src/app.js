const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'inventory', status: 'UP' });
});

module.exports = app;
