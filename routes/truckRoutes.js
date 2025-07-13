const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');

router.get('/', truckController.getAllTrucks);

module.exports = router;