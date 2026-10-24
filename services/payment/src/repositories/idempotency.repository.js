// Data access only: no business rules here.
module.exports = function createIdempotencyRepository(db) {
  return {
    // Returns true if THIS caller inserted the key (won the race), false if it already existed.
    async tryInsert(key, requestHash) {
      const r = await db.query(
        `INSERT INTO idempotency_keys (key, request_hash, state)
         VALUES ($1, $2, 'IN_PROGRESS')
         ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [key, requestHash],
      );
      return r.rowCount === 1;
    },

    async find(key) {
      const r = await db.query(
        `SELECT key, request_hash AS "requestHash", response_body AS "responseBody",
                status_code AS "statusCode", state
           FROM idempotency_keys WHERE key = $1`,
        [key],
      );
      return r.rows[0] || null;
    },

    async complete(key, statusCode, responseBody, client) {
      const q = client || db;
      await q.query(
        `UPDATE idempotency_keys
            SET state = 'DONE', status_code = $2, response_body = $3
          WHERE key = $1`,
        [key, statusCode, JSON.stringify(responseBody)],
      );
    },

    async remove(key) {
      await db.query('DELETE FROM idempotency_keys WHERE key = $1', [key]);
    },
  };
};
