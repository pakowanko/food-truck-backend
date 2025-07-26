const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

const isCronRequest = (req, res, next) => {
    if (req.get('X-Appengine-Cron') === 'true' || process.env.NODE_ENV !== 'production') {
        return next();
    }
    return res.status(403).send('Brak uprawnień.');
};

router.post('/send-reminders', isCronRequest, cronController.sendDailyReminders);
router.post('/generate-invoices', isCronRequest, cronController.generateDailyInvoices);
router.post('/send-profile-reminders', isCronRequest, cronController.sendProfileCreationReminders);

module.exports = router;
