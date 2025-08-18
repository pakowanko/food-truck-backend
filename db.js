// db.js
const { Pool } = require('pg');

const dbConfig = {
  connectionString: process.env.DATABASE_URL,

  // --- NAJWAŻNIEJSZE ZMIANY ---
  // Daje bazie danych 60 sekund na "obudzenie się" przy pierwszym połączeniu.
  connectionTimeoutMillis: 60000, 
  
  // Zamyka nieużywane połączenia po 30 sekundach, co pozwala bazie ponownie zasnąć.
  idleTimeoutMillis: 30000        
};

const pool = new Pool(dbConfig);

pool.query('SELECT version();')
  .then(res => console.log('✅ Pomyślnie połączono z bazą danych. Wersja:', res.rows[0].version))
  .catch(err => console.error('!!! KRYTYCZNY BŁĄD POŁĄCZENIA Z BAZĄ DANYCH:', err));

module.exports = pool;