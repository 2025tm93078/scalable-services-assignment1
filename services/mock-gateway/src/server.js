require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 3005;
app.listen(port, () => console.log(JSON.stringify({ service: 'mock-gateway', msg: 'listening', port })));
