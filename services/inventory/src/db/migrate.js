require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id   SERIAL PRIMARY KEY,
        sku  VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock (
        product_id INTEGER PRIMARY KEY REFERENCES products(id),
        available  INTEGER NOT NULL CHECK (available >= 0),
        version    INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id         SERIAL PRIMARY KEY,
        order_id   INTEGER NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        qty        INTEGER NOT NULL CHECK (qty > 0),
        status     VARCHAR(20) NOT NULL DEFAULT 'RESERVED'
                   CHECK (status IN ('RESERVED','CONFIRMED','RELEASED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => { console.error(err); process.exit(1); });