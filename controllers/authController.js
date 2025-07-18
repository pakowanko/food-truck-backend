const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.register = async (req, res) => {
    const {
        email, password, user_type, first_name, last_name,
        company_name, nip, phone_number, country_code,
        street_address, postal_code, city
    } = req.body;

    if (!email || !password || !user_type) {
        return res.status(400).json({ message: 'Podstawowe pola są wymagane.' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
            if (existingUser.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'Użytkownik o tym adresie email już istnieje.' });
            }

            let stripeCustomerId = null;
            if (user_type === 'food_truck_owner' && process.env.STRIPE_SECRET_KEY) {
                const customer = await stripe.customers.create({
                    email: email,
                    name: company_name || `${first_name} ${last_name}`,
                    phone: phone_number,
                    address: {
                        line1: street_address,
                        postal_code: postal_code,
                        city: city,
                        country: country_code
                    },
                    metadata: { nip: nip || '' }
                });
                stripeCustomerId = customer.id;
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const query = `
                INSERT INTO users (
                    email, password_hash, user_type, first_name, last_name,
                    company_name, nip, phone_number, country_code, stripe_customer_id,
                    street_address, postal_code, city
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING user_id, email, user_type`;

            const values = [
                email, hashedPassword, user_type, first_name, last_name,
                company_name, nip, phone_number, country_code, stripeCustomerId,
                street_address, postal_code, city
            ];

            const newUser = await client.query(query, values);

            const msg = {
                to: email,
                from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
                subject: 'Witaj w BookTheFoodTruck!',
                html: `<h1>Cześć ${first_name || ''}!</h1><p>Dziękujemy za rejestrację w naszym serwisie. Możesz teraz w pełni korzystać ze swojego konta.</p>`,
            };
            await sgMail.send(msg);

            await client.query('COMMIT');
            res.status(201).json(newUser.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Błąd podczas rejestracji:', error);
        res.status(500).json({ message: error.message || 'Błąd serwera podczas rejestracji.' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        const user = userResult.rows[0];

        if (user.is_blocked) {
            return res.status(403).json({ message: 'Twoje konto zostało zablokowane.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }

        const payload = { userId: user.user_id, email: user.email, user_type: user.user_type, role: user.role };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, userId: user.user_id, email: user.email, user_type: user.user_type, company_name: user.company_name, role: user.role });

    } catch (error) {
        console.error('Błąd podczas logowania:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const query = `
            SELECT user_id, email, user_type, first_name, last_name,
                   company_name, nip, phone_number, country_code,
                   street_address, postal_code, city, role
            FROM users
            WHERE user_id = $1
        `;
        const userResult = await pool.query(query, [req.user.userId]);

        if (userResult.rows.length > 0) {
            const userProfile = userResult.rows[0];
            res.json({
                userId: userProfile.user_id,
                email: userProfile.email,
                user_type: userProfile.user_type,
                first_name: userProfile.first_name,
                last_name: userProfile.last_name,
                company_name: userProfile.company_name,
                nip: userProfile.nip,
                phone_number: userProfile.phone_number,
                country_code: userProfile.country_code,
                street_address: userProfile.street_address,
                postal_code: userProfile.postal_code,
                city: userProfile.city,
                role: userProfile.role
            });
        } else {
            res.status(404).json({ message: 'Nie znaleziono użytkownika.' });
        }
    } catch (error) {
        console.error('Błąd podczas pobierania profilu:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};