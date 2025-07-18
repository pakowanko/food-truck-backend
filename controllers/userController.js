// controllers/userController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');

// Aktualizacja danych profilowych (imię, nazwisko, firma itp.)
exports.updateMyProfile = async (req, res) => {
    const { userId } = req.user;
    const { first_name, last_name, company_name, nip, phone_number, street_address, postal_code, city } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users SET 
                first_name = $1, last_name = $2, company_name = $3, nip = $4, 
                phone_number = $5, street_address = $6, postal_code = $7, city = $8
             WHERE user_id = $9 RETURNING *`,
            [first_name, last_name, company_name, nip, phone_number, street_address, postal_code, city, userId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd aktualizacji profilu użytkownika:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

// Aktualizacja hasła
exports.updateMyPassword = async (req, res) => {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    try {
        const userResult = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
        const user = userResult.rows[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Obecne hasło jest nieprawidłowe.' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hashedNewPassword, userId]);

        res.json({ message: 'Hasło zostało pomyślnie zmienione.' });
    } catch (error) {
        console.error("Błąd zmiany hasła:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};