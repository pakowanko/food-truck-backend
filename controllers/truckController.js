const pool = require('../db');

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
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
// Resztę funkcji (create, update) dodamy, gdy formularze będą gotowe