require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(JSON.stringify({ service: 'inventory', msg: 'listening', port })));
