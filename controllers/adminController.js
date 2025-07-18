// controllers/adminController.js
const pool = require('../db');

exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, email, user_type, first_name, last_name, company_name, is_blocked, role FROM users ORDER BY user_id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania użytkowników (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};