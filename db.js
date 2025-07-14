// db.js
const { Pool } = require('pg');

console.log('Łączenie z bazą danych przez DATABASE_URL...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;