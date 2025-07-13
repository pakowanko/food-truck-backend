const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const authenticateToken = require('../middleware/authenticateToken');
const multer = require('multer');

// Konfiguracja Multer do obsługi plików w pamięci
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// === Trasy dla Food Trucków ===

// Publiczne
router.get('/', truckController.getAllTrucks);
router.get('/:profileId', truckController.getTruckById);

// Chronione (dla zalogowanych)
router.post('/', authenticateToken, upload.array('photos', 10), truckController.createProfile);
router.put('/:profileId', authenticateToken, upload.array('photos', 10), truckController.updateProfile);
router.get('/my-truck', authenticateToken, truckController.getMyTruck); // Ta trasa może być nieużywana, ale nie powoduje błędu

module.exports = router;