// db.js
const { Pool } = require('pg');

console.log('Łączenie z bazą danych przez DATABASE_URL z SSL...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;