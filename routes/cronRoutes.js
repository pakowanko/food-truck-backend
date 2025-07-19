const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

const isCronRequest = (req, res, next) => {
    if (req.get('X-Appengine-Cron') === 'true') {
        return next();
    }
    return res.status(403).send('Brak uprawnień.');
};

router.post('/send-reminders', isCronRequest, cronController.sendDailyReminders);

module.exports = router;