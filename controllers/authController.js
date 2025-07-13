// controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- REJESTRACJA UŻYTKOWNIKA ---
exports.register = async (req, res) => {
    // Pobieramy WSZYSTKIE dane z formularza
    const { 
        email, password, user_type, first_name, last_name, 
        company_name, nip, phone_number,
        // Nowe pola specyficzne dla właściciela
        base_postal_code, cuisine_type, dietary_options, beverages 
    } = req.body;
    
    if (!email || !password || !user_type) {
        return res.status(400).json({ message: 'Email, hasło i typ użytkownika są wymagane.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'Użytkownik o tym adresie email już istnieje.' });
        }

        let stripeCustomerId = null;
        if (user_type === 'owner' && process.env.STRIPE_SECRET_KEY) {
            const customer = await stripe.customers.create({ 
                email, 
                name: `${first_name} ${last_name}` 
            });
            stripeCustomerId = customer.id;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Kompletne zapytanie INSERT, które uwzględnia wszystkie nowe kolumny
        const query = `
            INSERT INTO users (
                email, password_hash, user_type, first_name, last_name, 
                company_name, nip, phone_number, country_code, stripe_customer_id,
                base_postal_code, cuisine_type, dietary_options, beverages
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING user_id, email, user_type`;
            
        const values = [
            email, hashedPassword, user_type, first_name, last_name, 
            company_name, nip, phone_number, 'PL', stripeCustomerId,
            base_postal_code, cuisine_type, dietary_options, beverages
        ];

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

// --- LOGOWANIE UŻYTKOWNIKA ---
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        
        const payload = { userId: user.user_id, user_type: user.user_type };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        delete user.password_hash;
        res.json({ token, user: user });
    } catch (error) {
        console.error('Błąd logowania:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

// --- POBIERANIE PROFILU ZALOGOWANEGO UŻYTKOWNIKA ---
exports.getProfile = async (req, res) => {
    try {
        // req.user jest dodawany przez middleware `authenticateToken`
        const userResult = await pool.query(
            "SELECT * FROM users WHERE user_id = $1", 
            [req.user.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "Nie znaleziono użytkownika." });
        }

        const user = userResult.rows[0];
        delete user.password_hash; // Zawsze usuwaj hasło przed wysłaniem!
        
        res.json(user);
    } catch (err) {
        console.error("Błąd w /api/auth/profile:", err.message);
        res.status(500).json({ message: "Błąd serwera" });
    }
};