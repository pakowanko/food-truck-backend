// db.js - WERSJA OSTATECZNA Z LENIWĄ INICJALIZACJĄ

const { Pool } = require('pg');

let pool; // Deklarujemy zmienną, ale jej nie inicjalizujemy

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  // Dajemy bazie 60 sekund na "obudzenie się" przy pierwszym połączeniu
  connectionTimeoutMillis: 60000,
  // Zamykamy nieużywane połączenia po 30 sekundach
  idleTimeoutMillis: 30000
};

// Funkcja, która tworzy pulę, jeśli jeszcze nie istnieje
const getPool = () => {
  if (!pool) {
    console.log('Inicjalizacja puli połączeń...');
    pool = new Pool(dbConfig);

    // Dodajemy nasłuchiwanie na błędy, aby wiedzieć, co się dzieje w puli
    pool.on('error', (err, client) => {
      console.error('Nieoczekiwany błąd w puli połączeń', err);
      process.exit(-1);
    });
  }
  return pool;
};

// Eksportujemy obiekt, który używa naszej funkcji 'getPool'
// Dzięki temu reszta aplikacji nie musi być zmieniana
module.exports = {
  query: (text, params) => getPool().query(text, params),
  connect: () => getPool().connect(),
};