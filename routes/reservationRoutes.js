const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/', authenticateToken, reservationController.createReservation);
router.get('/my-reservations', authenticateToken, reservationController.getMyReservations);
router.put('/:reservationId/status', authenticateToken, reservationController.updateReservationStatus);

module.exports = router;