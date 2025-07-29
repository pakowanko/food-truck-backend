const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const authMiddleware = require('../middleware/authMiddleware'); // Dodany import
const isAdmin = require('../middleware/isAdmin'); // Dodany import

// Usunęliśmy funkcję isCronRequest.
// Uwierzytelnianie będzie teraz obsługiwane automatycznie przez Cloud Run i token OIDC.

// Trasy dla Cloud Scheduler (zabezpieczone tokenem OIDC w Google Cloud)
router.post('/send-reminders', cronController.sendDailyReminders);
router.post('/generate-invoices', cronController.generateDailyInvoices);
router.post('/send-profile-reminders', cronController.sendProfileCreationReminders);

// --- NOWA TRASA DLA ADMINISTRATORA ---
// Ta trasa jest chroniona podwójnie:
// 1. authMiddleware - sprawdza, czy użytkownik jest zalogowany (ważny token JWT)
// 2. isAdmin - sprawdza, czy zalogowany użytkownik ma rolę 'admin'
router.post(
    '/publish-all-existing', 
    authMiddleware, 
    isAdmin, 
    cronController.publishAllExistingProfiles
);

module.exports = router;
