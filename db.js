// db.js
const { Pool } = require('pg');

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = new Pool(dbConfig);

pool.query('SELECT version();')
  .then(res => console.log('✅ Pomyślnie połączono z bazą danych. Wersja:', res.rows[0].version))
  .catch(err => console.error('!!! KRYTYCZNY BŁĄD POŁĄCZENIA Z BAZĄ DANYCH:', err));

module.exports = pool;