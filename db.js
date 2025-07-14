// db.js
const { Pool } = require('pg');

console.log('Łączenie z bazą danych przez parametry...');

const pool = new Pool({
  user: process.env.DB_USER,
  host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

module.exports = pool;