// routes/bookingRequestRoutes.js
const express = require('express');
const router = express.Router();
// ZMIANA: Import nowego kontrolera
const bookingRequestController = require('../controllers/bookingRequestController');
const authenticateToken = require('../middleware/authenticateToken');

// ZMIANA: Wywołanie funkcji z nowego kontrolera
router.post('/', authenticateToken, bookingRequestController.createBookingRequest);
router.get('/my-bookings', authenticateToken, bookingRequestController.getMyBookings); // ZMIANA: Lepsza nazwa trasy
router.put('/:requestId/status', authenticateToken, bookingRequestController.updateBookingStatus);

module.exports = router;