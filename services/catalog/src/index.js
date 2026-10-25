require('dotenv').config();
require('express-async-errors'); // Helps catch errors automatically
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('crypto');

const app = express();
const productRoutes = require('./routes/productRoutes');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(express.json());

// Middleware: Add Correlation ID to every request
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
});

// Middleware: Logging
app.use(pinoHttp({ logger, genReqId: req => req.id }));

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'catalog' });
});

// Register your catalog routes
app.use('/api/v1/catalog', productRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error(err);
    const status = err.status || 500;
    res.status(status).json({
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message: err.message || 'An unexpected error occurred',
            requestId: req.id
        }
    });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    logger.info(`Catalog service running on port ${PORT}`);
});