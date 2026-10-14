require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 3003;
app.listen(port, () => console.log(JSON.stringify({ service: 'payment', msg: 'listening', port })));
