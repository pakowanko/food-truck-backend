// routes/gusRoutes.js
const express = require('express');
const router = express.Router();
const gusController = require('../controllers/gusController');
const authenticateToken = require('../middleware/authenticateToken');

// Definiujemy ścieżkę, która przyjmuje NIP jako parametr
router.get('/company-data/:nip', authenticateToken, gusController.getCompanyDataByNip);

module.exports = router;