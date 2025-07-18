// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

const isAdmin = [authenticateToken, authorizeAdmin]; // Skrót dla zabezpieczeń

router.get('/users', isAdmin, adminController.getAllUsers);
router.put('/users/:userId/toggle-block', isAdmin, adminController.toggleUserBlock);

router.get('/bookings', isAdmin, adminController.getAllBookings);
router.put('/bookings/:requestId/packaging-status', isAdmin, adminController.updatePackagingStatus);

module.exports = router;