const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { sendVerificationEmail, sendPasswordResetEmail, sendGoogleWelcomeEmail } = require('../utils/emailTemplate');
const sgMail = require('@sendgrid/mail');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const GOOGLE_CLIENT_ID = '1035693089076-606q1auo4o0cb62lmj21djqeqjvor4pj.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

exports.register = async (req, res) => {
    const { 
        email, password, user_type, first_name, last_name, 
        company_name, nip, phone_number, country_code,
        street_address, postal_code, city
    } = req.body;

    if (!email || !password || !user_type) {
        return res.status(400).json({ message: 'Podstawowe pola są wymagane.' });
    }

    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');

        const existingUser = await dbClient.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            await dbClient.query('ROLLBACK');
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
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const query = `
            INSERT INTO users (
                email, password_hash, user_type, first_name, last_name, 
                company_name, nip, phone_number, country_code, stripe_customer_id,
                street_address, postal_code, city, is_verified, verification_token
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14) 
            RETURNING user_id, email, user_type`;
            
        const values = [
            email, hashedPassword, user_type, first_name, last_name, 
            company_name, nip, phone_number, country_code, stripeCustomerId,
            street_address, postal_code, city, verificationToken
        ];
        
        await dbClient.query(query, values);

        await sendVerificationEmail(email, verificationToken);
        
        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Rejestracja pomyślna. Sprawdź swój e-mail, aby aktywować konto.' });
    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error('Błąd podczas rejestracji:', error);
        res.status(500).json({ message: error.message || 'Błąd serwera podczas rejestracji.' });
    } finally {
        if(dbClient) dbClient.release();
    }
};

exports.verifyEmail = async (req, res) => {
    const { token } = req.query;
    try {
        const result = await pool.query('SELECT * FROM users WHERE verification_token = $1', [token]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Nieprawidłowy lub wygasły token weryfikacyjny.' });
        }
        
        const user = result.rows[0];
        await pool.query(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE user_id = $1',
            [user.user_id]
        );

        res.json({ message: 'Konto zostało pomyślnie zweryfikowane.' });
    } catch (error) {
        console.error('Błąd podczas weryfikacji emaila:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
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

        if (!user.is_verified) {
            return res.status(403).json({ message: 'Konto nie zostało jeszcze aktywowane. Sprawdź swój e-mail.' });
        }

        if (user.is_blocked) {
            return res.status(403).json({ message: 'Twoje konto zostało zablokowane.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nieprawidłowy email lub hasło.' });
        }
        
        const payload = { userId: user.user_id, email: user.email, user_type: user.user_type, role: user.role };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, userId: user.user_id, email: user.email, user_type: user.user_type, company_name: user.company_name, role: user.role, first_name: user.first_name });

    } catch (error) {
        console.error('Błąd podczas logowania:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.googleLogin = async (req, res) => {
    const { credential } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, given_name, family_name } = payload;

        let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = userResult.rows[0];

        if (!user) {
            console.log(`Użytkownik Google nie istnieje, tworzenie nowego konta dla: ${email}`);
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            const newUserQuery = await pool.query(
                `INSERT INTO users (email, password_hash, user_type, first_name, last_name, is_verified, role)
                 VALUES ($1, $2, 'organizer', $3, $4, TRUE, 'user') RETURNING *`,
                [email, hashedPassword, given_name, family_name]
            );
            user = newUserQuery.rows[0];
            await sendGoogleWelcomeEmail(email, given_name);
        }

        if (user.is_blocked) {
            return res.status(403).json({ message: 'Twoje konto zostało zablokowane.' });
        }

        const appPayload = { userId: user.user_id, email: user.email, user_type: user.user_type, role: user.role };
        const token = jwt.sign(appPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, userId: user.user_id, email: user.email, user_type: user.user_type, company_name: user.company_name, role: user.role, first_name: user.first_name });

    } catch (error) {
        console.error("Błąd podczas logowania przez Google:", error);
        res.status(500).json({ message: "Błąd serwera podczas logowania przez Google." });
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

exports.requestPasswordReset = async (req, res) => {
    const { email } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.json({ message: 'Jeśli konto o podanym adresie email istnieje, link do resetu hasła został wysłany.' });
        }
        
        const user = userResult.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // Token ważny 1 godzinę

        await pool.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE user_id = $3',
            [token, expires, user.user_id]
        );

        await sendPasswordResetEmail(user.email, token);
        res.json({ message: 'Jeśli konto o podanym adresie email istnieje, link do resetu hasła został wysłany.' });
    } catch (error) {
        console.error("Błąd podczas prośby o reset hasła:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: 'Token do resetu hasła jest nieprawidłowy lub wygasł.' });
        }
        
        const user = userResult.rows[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE user_id = $2',
            [hashedPassword, user.user_id]
        );

        res.json({ message: 'Hasło zostało pomyślnie zmienione.' });
    } catch (error) {
        console.error("Błąd podczas resetowania hasła:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};
