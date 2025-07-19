const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

// Proste zabezpieczenie - sprawdzamy nagłówek, który doda tylko Google Cloud Scheduler
const isCronRequest = (req, res, next) => {
    if (req.get('X-Appengine-Cron') === 'true') {
        return next();
    }
    // W środowisku deweloperskim możemy pominąć ten test
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }
    return res.status(403).send('Brak uprawnień.');
};

router.post('/send-reminders', isCronRequest, cronController.sendDailyReminders);
router.post('/generate-invoices', isCronRequest, cronController.generateDailyInvoices);

module.exports = router;