const express = require('express');
const router = express.Router();
const truckController = require('../controllers/truckController');
const authenticateToken = require('../middleware/authenticateToken');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage: storage });

router.post('/', authenticateToken, upload.single('main_image'), truckController.createTruck);
router.get('/my-truck', authenticateToken, truckController.getMyTruck);
router.get('/', truckController.getAllTrucks);

module.exports = router;