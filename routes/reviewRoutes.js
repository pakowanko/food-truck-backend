const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/', authenticateToken, reviewController.createReview);
router.get('/truck/:truckId', reviewController.getReviewsForTruck);

module.exports = router;