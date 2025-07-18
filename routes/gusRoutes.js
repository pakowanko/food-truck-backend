// routes/gusRoutes.js
const express = require('express');
const router = express.Router();
const gusController = require('../controllers/gusController');
const authenticateToken = require('../middleware/authenticateToken');

// Dodajemy ten log, aby sprawdzić, czy plik jest w ogóle uruchamiany
console.log('--- Plik gusRoutes.js został pomyślnie załadowany! ---');

// Definiujemy ścieżkę, która przyjmuje NIP jako parametr
router.get('/company-data/:nip', authenticateToken, gusController.getCompanyDataByNip);

module.exports = router;