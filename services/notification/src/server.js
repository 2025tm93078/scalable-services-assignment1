require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 3004;
app.listen(port, () => console.log(JSON.stringify({ service: 'notification', msg: 'listening', port })));
