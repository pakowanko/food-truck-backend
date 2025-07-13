const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { email, password, user_type, first_name, last_name, phone_number, company_name, nip } = req.body;
    if (!email || !password || !user_type) return res.status(400).json({ message: 'Wymagane pola nie zostały wypełnione.' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            `INSERT INTO users (email, password_hash, user_type, first_name, last_name, phone_number, company_name, nip) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING user_id, email, user_type`,
            [email, hashedPassword, user_type, first_name, last_name, phone_number, company_name, nip]
        );
        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Użytkownik o tym emailu już istnieje.' });
        console.error('Błąd rejestracji:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        const payload = { userId: user.user_id, user_type: user.user_type };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        delete user.password_hash;
        res.json({ token, user });
    } catch (error) {
        console.error('Błąd logowania:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};