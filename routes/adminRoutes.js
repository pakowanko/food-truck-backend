// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

// Stosujemy oba zabezpieczenia: najpierw sprawdzamy, czy użytkownik jest zalogowany,
// a potem, czy jest adminem.
router.get('/users', [authenticateToken, authorizeAdmin], adminController.getAllUsers);

module.exports = router;