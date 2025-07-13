const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const authenticateToken = require('../middleware/authenticateToken');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get('/', truckController.getAllTrucks);
router.get('/my-truck', authenticateToken, truckController.getMyTruck);
router.get('/:profileId', truckController.getTruckById);
router.post('/', authenticateToken, upload.array('reference_photos', 10), truckController.createProfile);
router.put('/:profileId', authenticateToken, upload.array('reference_photos', 10), truckController.updateProfile);

module.exports = router;