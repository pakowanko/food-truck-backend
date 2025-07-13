const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const authenticateToken = require('../middleware/authenticateToken');
const multer = require('multer');

// Konfiguracja Multer do obsługi plików w pamięci
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB na plik
});

// --- Trasy dla profili food trucków ---

// Tworzenie nowego profilu food trucka
router.post('/', authenticateToken, upload.array('reference_photos', 10), truckController.createProfile);

// Publiczna trasa do pobierania wszystkich food trucków
router.get('/', truckController.getAllTrucks);

// Publiczna trasa do pobierania jednego food trucka
router.get('/:profileId', truckController.getTruckById);

// Chroniona trasa do aktualizacji profilu
router.put('/:profileId', authenticateToken, upload.array('reference_photos', 10), truckController.updateProfile);

// Chroniona trasa do pobierania własnego profilu (jeśli potrzebna)
router.get('/my-profile', authenticateToken, truckController.getMyTruck);


module.exports = router;