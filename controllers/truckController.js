const pool = require('../db');

exports.createTruck = async (req, res) => {
    const { truck_name, description, cuisine_types, base_postal_code, service_radius_km } = req.body;
    const ownerId = req.user.userId;
    const mainImageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    try {
        const newTruck = await pool.query(
            'INSERT INTO trucks (owner_id, truck_name, description, cuisine_types, base_postal_code, service_radius_km, main_image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [ownerId, truck_name, description, cuisine_types, base_postal_code, service_radius_km, mainImageUrl]
        );
        res.status(201).json(newTruck.rows[0]);
    } catch (error) {
        console.error('Błąd dodawania food trucka:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getMyTruck = async (req, res) => {
    try {
        const truck = await pool.query('SELECT * FROM trucks WHERE owner_id = $1', [req.user.userId]);
        if (truck.rows.length > 0) {
            res.json(truck.rows[0]);
        } else {
            res.status(404).json({ message: 'Nie znaleziono food trucka dla tego użytkownika.' });
        }
    } catch (error) {
        console.error("Błąd w /api/trucks/my-truck:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getAllTrucks = async (req, res) => {
    try {
        const trucksResult = await pool.query('SELECT * FROM trucks');
        res.json(trucksResult.rows);
    } catch (error) {
        console.error("Błąd wyszukiwania food trucków:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};
// Dodaj tu inne potrzebne funkcje, np. getTruckById, updateTruck...