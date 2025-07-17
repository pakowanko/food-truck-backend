// db.js
const { Pool } = require('pg');

console.log('Łączenie z bazą danych przez DATABASE_URL z SSL...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// === NOWY BLOK DIAGNOSTYCZNY ===
pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'conversations';
`)
.then(res => {
  console.log('--- DIAGNOSTYKA: Struktura tabeli "conversations" ---');
  console.log(res.rows);
  console.log('----------------------------------------------------');
})
.catch(err => {
  console.error('!!! BŁĄD DIAGNOSTYKI: Nie można odczytać struktury tabeli "conversations" !!!', err);
});
// ================================

module.exports = pool;