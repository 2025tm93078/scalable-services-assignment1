const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'order', status: 'UP' });
});

module.exports = app;
