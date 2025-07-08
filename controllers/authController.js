const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.register = async (req, res) => {
    const { email, password, user_type, first_name, last_name, company_name, nip, phone_number, country_code } = req.body;
    if (!email || !password || !user_type) return res.status(400).json({ message: 'Email, hasło i typ użytkownika są wymagane.' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) return res.status(409).json({ message: 'Użytkownik o tym adresie email już istnieje.' });

        let stripeCustomerId = null;
        if (user_type === 'owner') {
            const customer = await stripe.customers.create({ email, name: `${first_name} ${last_name}` });
            stripeCustomerId = customer.id;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (email, password_hash, user_type, first_name, last_name, company_name, nip, phone_number, country_code, stripe_customer_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING user_id, email, user_type`;
        const values = [email, hashedPassword, user_type, first_name, last_name, company_name, nip, phone_number, country_code, stripeCustomerId];
        const newUser = await client.query(query, values);
        await client.query('COMMIT');
        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Błąd podczas rejestracji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas rejestracji.' });
    } finally {
        client.release();
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(400).json({ message: 'Nieprawidłowy email lub hasło.' });
        const user = userResult.rows[0];
        if (!user.password_hash) return res.status(400).json({ message: 'Nieprawidłowy email lub hasło.' });
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ message: 'Nieprawidłowy email lub hasło.' });
        const token = jwt.sign({ userId: user.user_id, role: user.user_type }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, userId: user.user_id, user_type: user.user_type });
    } catch (error) {
        console.error('Błąd logowania:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const userResult = await pool.query("SELECT user_id, email, user_type, first_name, last_name FROM users WHERE user_id = $1", [req.user.userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ message: "Nie znaleziono użytkownika." });
        res.json(userResult.rows[0]);
    } catch (err) {
        console.error("Błąd w /api/auth/profile:", err.message);
        res.status(500).json({ message: "Błąd serwera" });
    }
};