// routes/foodTruckProfileRoutes.js
const express = require('express');
const router = express.Router();
// ZMIANA: Import nowego kontrolera
const foodTruckProfileController = require('../controllers/foodTruckProfileController'); 
const authenticateToken = require('../middleware/authenticateToken');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB na plik
});

// ZMIANA: Użycie 'gallery_photos' jako nazwy pola i nowego kontrolera
router.post('/', authenticateToken, upload.array('gallery_photos', 10), foodTruckProfileController.createProfile);

// ZMIANA: Użycie nowego kontrolera
router.get('/my-profile', authenticateToken, foodTruckProfileController.getMyProfile);
router.get('/', foodTruckProfileController.getAllProfiles); 
router.get('/:profileId', foodTruckProfileController.getProfileById);

// ZMIANA: Użycie 'gallery_photos' i nowego kontrolera
router.put('/:profileId', authenticateToken, upload.array('gallery_photos', 10), foodTruckProfileController.updateProfile);

module.exports = router;