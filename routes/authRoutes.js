// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authenticateToken, authController.getProfile);
// --- NOWA ŚCIEŻKA ---
router.get('/verify-email', authController.verifyEmail);

module.exports = router;