const { Pool } = require('pg');
require('dotenv').config();

// Create a connection pool using the environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};