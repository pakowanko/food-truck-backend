// db.js
const { Pool } = require('pg');

console.log('--- Inicjalizacja Połączenia z Bazą Danych ---');

const config = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

// === NOWY BLOK DIAGNOSTYCZNY ===
console.log('Używana konfiguracja połączenia (bez hasła):');
const { password, ...configWithoutPassword } = config;
console.log(configWithoutPassword);
console.log('-------------------------------------------');
// ================================

const pool = new Pool(config);

pool.on('error', (err, client) => {
  console.error('!!! Nieoczekiwany błąd na kliencie puli połączeń !!!', err);
  process.exit(-1);
});

module.exports = pool;