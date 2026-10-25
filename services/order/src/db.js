const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function createDb(connectionString) {
  const pool = new Pool({ connectionString });

  // Run fn inside a single transaction (BEGIN/COMMIT, ROLLBACK on error)
  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
  }

  return { pool, tx, migrate, query: (...a) => pool.query(...a) };
}

module.exports = { createDb };
