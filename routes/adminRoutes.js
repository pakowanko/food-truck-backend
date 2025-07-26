const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

const isAdmin = [authenticateToken, authorizeAdmin];

router.get('/stats', isAdmin, adminController.getDashboardStats);

router.get('/users', isAdmin, adminController.getAllUsers);
router.put('/users/:userId/toggle-block', isAdmin, adminController.toggleUserBlock);
router.put('/users/:userId', isAdmin, adminController.updateUser);
router.delete('/users/:userId', isAdmin, adminController.deleteUser);

router.get('/bookings', isAdmin, adminController.getAllBookings);
router.put('/bookings/:requestId/packaging-status', isAdmin, adminController.updatePackagingStatus);
router.put('/bookings/:requestId/commission-status', isAdmin, adminController.updateCommissionStatus);

// --- NOWE ŚCIEŻKI ---
router.get('/conversations', isAdmin, adminController.getAllConversations);
router.get('/conversations/:conversationId/messages', isAdmin, adminController.getConversationMessages);

// --- NOWE ŚCIEŻKI ---
router.get('/users/:userId/profiles', isAdmin, adminController.getUserProfiles);
router.delete('/profiles/:profileId', isAdmin, adminController.deleteProfile);

module.exports = router;
