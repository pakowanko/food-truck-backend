const pool = require('../db');

// Pobieranie wszystkich food trucków
exports.getAllTrucks = async (req, res) => {
    try {
        const allTrucks = await pool.query(`
            SELECT p.*, COALESCE(AVG(r.rating), 0) as average_rating, COUNT(r.review_id) as review_count
            FROM truck_profiles p
            LEFT JOIN reviews r ON p.profile_id = r.profile_id
            GROUP BY p.profile_id
        `);
        res.json(allTrucks.rows);
    } catch (err) {
        console.error("Błąd w getAllTrucks:", err.message);
        res.status(500).send('Server Error');
    }
};

// Pobieranie jednego food trucka po ID
exports.getTruckById = async (req, res) => {
    try {
        const { profileId } = req.params;
        const truck = await pool.query("SELECT * FROM truck_profiles WHERE profile_id = $1", [profileId]);
        if (truck.rows.length === 0) {
            return res.status(404).json({ message: "Nie znaleziono food trucka." });
        }
        res.json(truck.rows[0]);
    } catch (err) {
        console.error("Błąd w getTruckById:", err.message);
        res.status(500).send("Server Error");
    }
};

// Poniższe funkcje są na razie zaślepkami, aby serwer mógł się uruchomić.
// Rozbudujemy je w kolejnych krokach.
exports.createProfile = async (req, res) => res.status(501).send('Not Implemented Yet');
exports.updateProfile = async (req, res) => res.status(501).send('Not Implemented Yet');
exports.getMyTruck = async (req, res) => res.status(501).send('Not Implemented Yet');