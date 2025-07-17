// db.js
const { Pool } = require('pg');

console.log('--- Inicjalizacja Połączenia z Bazą Danych (Wersja Diagnostyczna) ---');

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

// === Logowanie Konfiguracji ===
console.log('Używana konfiguracja połączenia (bez hasła):');
const { password, ...configForLogging } = dbConfig;
console.log(JSON.stringify(configForLogging, null, 2));
console.log('-------------------------------------------');
// ===============================

const pool = new Pool(dbConfig);

// === Testowe Połączenie przy Starcie Aplikacji ===
pool.query('SELECT version();')
  .then(res => {
    console.log('✅✅✅ Pomyślnie połączono z bazą danych! ✅✅✅');
    console.log('Wersja serwera PostgreSQL:', res.rows[0].version);
    console.log('-------------------------------------------');
  })
  .catch(err => {
    console.error('!!! KRYTYCZNY BŁĄD POŁĄCZENIA Z BAZĄ DANYCH PRZY STARCIE !!!');
    console.error(err);
    console.log('-------------------------------------------');
  });
// ===============================================

pool.on('error', (err, client) => {
  console.error('Nieoczekiwany błąd na kliencie puli połączeń', err);
});

module.exports = pool;