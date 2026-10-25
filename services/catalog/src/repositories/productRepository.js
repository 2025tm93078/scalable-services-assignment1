const db = require('./db');

async function createProduct(productData) {
    const { name, description, price, category } = productData;
    const query = `
    INSERT INTO products (name, description, price, category)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
    const values = [name, description, price, category];
    const result = await db.query(query, values);
    return result.rows[0];
}

async function getAllProducts() {
    const result = await db.query('SELECT * FROM products');
    return result.rows;
}

module.exports = { createProduct, getAllProducts };