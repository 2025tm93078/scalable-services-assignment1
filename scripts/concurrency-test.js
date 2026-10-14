const http = require('http');

const INVENTORY_URL = 'http://localhost:3001';
const STOCK = 5;
const TOTAL_REQUESTS = 20;

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request(`${INVENTORY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    http.get(`${INVENTORY_URL}${path}`, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
  });
}

async function main() {
  console.log(`\n=== Challenge 1: Concurrency Test ===`);
  console.log(`Stock: ${STOCK}, Parallel requests: ${TOTAL_REQUESTS}\n`);

  const setup = await post('/api/v1/products', {
    sku: `CONC-${Date.now()}`,
    name: 'Concurrency Test Product',
    initialStock: STOCK
  });

  if (!setup.body.id) {
    console.error('Failed to create product', setup.body);
    process.exit(1);
  }

  const productId = setup.body.id;
  console.log(`Product created: id=${productId}, stock=${STOCK}`);

  const requests = Array.from({ length: TOTAL_REQUESTS }, (_, i) =>
    post('/api/v1/reservations', { orderId: i + 1, productId, qty: 1 })
  );

  const results = await Promise.all(requests);

  const succeeded = results.filter(r => r.status === 201);
  const failed    = results.filter(r => r.status === 409);

  console.log(`\nResults:`);
  console.log(`  Succeeded (201): ${succeeded.length}`);
  console.log(`  Failed    (409): ${failed.length}`);

  const stockRes = await get(`/api/v1/products/${productId}/stock`);
  console.log(`  Final stock:     ${stockRes.body.available}`);

  console.log(`\nAssertion check:`);
  const pass = succeeded.length === STOCK && failed.length === TOTAL_REQUESTS - STOCK && stockRes.body.available === 0;
  console.log(`  Exactly ${STOCK} succeeded:       ${succeeded.length === STOCK ? 'PASS' : 'FAIL'}`);
  console.log(`  Exactly ${TOTAL_REQUESTS - STOCK} failed:      ${failed.length === TOTAL_REQUESTS - STOCK ? 'PASS' : 'FAIL'}`);
  console.log(`  Final stock is 0:        ${stockRes.body.available === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`\nOverall: ${pass ? 'ALL PASS' : 'SOME FAILED'}`);

  if (!pass) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });