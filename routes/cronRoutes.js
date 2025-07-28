const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

// Usunęliśmy funkcję isCronRequest.
// Uwierzytelnianie będzie teraz obsługiwane automatycznie przez Cloud Run i token OIDC.

router.post('/send-reminders', cronController.sendDailyReminders);
router.post('/generate-invoices', cronController.generateDailyInvoices);
router.post('/send-profile-reminders', cronController.sendProfileCreationReminders);

module.exports = router;