const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Używamy middleware do autoryzacji i sprawdzania uprawnień admina dla wszystkich tras w tym pliku
router.use(authMiddleware);
router.use(adminMiddleware);

// Trasy do pobierania danych
router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/bookings', adminController.getAllBookings);
router.get('/conversations', adminController.getAllConversations);
router.get('/conversations/:conversationId/messages', adminController.getConversationMessages);
router.get('/users/:userId/profiles', adminController.getUserProfiles);

// Trasy do aktualizacji i modyfikacji danych
router.put('/users/:userId/toggle-block', adminController.toggleUserBlock);
router.put('/users/:userId', adminController.updateUser);
router.put('/bookings/:requestId/packaging-status', adminController.updatePackagingStatus);
router.put('/bookings/:requestId/commission-status', adminController.updateCommissionStatus);

// --- NOWA TRASA do aktualizacji szczegółów profilu (w tym promienia) ---
router.put('/profiles/:profileId/details', adminController.updateProfileDetails);

// Trasy do usuwania danych
router.delete('/users/:userId', adminController.deleteUser);
router.delete('/profiles/:profileId', adminController.deleteProfile);

// Trasa do webhooka Stripe - powinna być wyłączona z middleware autoryzacji, jeśli jest publiczna
// W tym przypadku zakładamy, że jest w tym samym pliku i wymaga uprawnień admina do podglądu
// UWAGA: W produkcji webhook Stripe powinien być publicznym endpointem bez authMiddleware!
router.post('/stripe-webhook', express.raw({type: 'application/json'}), adminController.handleStripeWebhook);

// Trasa do jednorazowej synchronizacji
router.post('/sync-stripe', adminController.syncAllUsersWithStripe);

module.exports = router;
