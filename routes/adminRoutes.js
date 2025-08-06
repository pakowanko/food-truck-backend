const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

// Używamy middleware do autoryzacji i sprawdzania uprawnień admina dla wszystkich tras w tym pliku
router.use(authenticateToken);
router.use(authorizeAdmin);

// Trasy do pobierania danych
router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/bookings', adminController.getAllBookings);
router.get('/conversations', adminController.getAllConversations);
router.get('/conversations/:conversationId/messages', adminController.getConversationMessages);
router.get('/users/:userId/profiles', adminController.getUserProfiles);

// --- NOWA TRASA: Pobieranie pełnych danych profilu do edycji ---
// Ta linia jest kluczowa, aby okno edycji mogło pobrać dane.
router.get('/profiles/:profileId', adminController.getProfileForAdmin);

// Trasy do aktualizacji i modyfikacji danych
router.put('/users/:userId/toggle-block', adminController.toggleUserBlock);
router.put('/users/:userId', adminController.updateUser);
router.put('/bookings/:requestId/packaging-status', adminController.updatePackagingStatus);
router.put('/bookings/:requestId/commission-status', adminController.updateCommissionStatus);
router.put('/profiles/:profileId/details', adminController.updateProfileDetails);

// --- NOWA TRASA: Usuwanie pojedynczego zdjęcia ---
router.delete('/profiles/:profileId/photo', adminController.deleteProfilePhoto);

// Trasy do usuwania danych
router.delete('/users/:userId', adminController.deleteUser);
router.delete('/profiles/:profileId', adminController.deleteProfile);

// Trasa do webhooka Stripe
router.post('/stripe-webhook', express.raw({type: 'application/json'}), adminController.handleStripeWebhook);

// Trasa do jednorazowej synchronizacji
router.post('/sync-stripe', adminController.syncAllUsersWithStripe);

module.exports = router;
