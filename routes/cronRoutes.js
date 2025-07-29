const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

// Używamy Twojego istniejącego pliku do uwierzytelniania
const authenticateToken = require('../middleware/authenticateToken'); 
// Importujemy nasz nowy plik sprawdzający, czy użytkownik jest adminem
const isAdmin = require('../middleware/isAdmin'); 

// Trasy dla Cloud Scheduler (zabezpieczone tokenem OIDC w Google Cloud)
router.post('/send-reminders', cronController.sendDailyReminders);
router.post('/generate-invoices', cronController.generateDailyInvoices);
router.post('/send-profile-reminders', cronController.sendProfileCreationReminders);

// --- NOWA TRASA DLA ADMINISTRATORA ---
// Ta trasa jest chroniona podwójnie:
// 1. authenticateToken - sprawdza, czy użytkownik jest zalogowany (Twój istniejący middleware)
// 2. isAdmin - sprawdza, czy zalogowany użytkownik ma rolę 'admin'
router.post(
    '/publish-all-existing', 
    authenticateToken, 
    isAdmin, 
    cronController.publishAllExistingProfiles
);

module.exports = router;
