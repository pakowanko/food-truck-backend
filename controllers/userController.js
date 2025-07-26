// controllers/userController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
// --- POCZĄTEK NOWEJ LOGIKI (1/2) ---
// Dodajemy 'stripe', aby móc komunikować się z API Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// --- KONIEC NOWEJ LOGIKI (1/2) ---

// Aktualizacja danych profilowych (imię, nazwisko, firma itp.)
exports.updateMyProfile = async (req, res) => {
    const { userId } = req.user;
    const { first_name, last_name, company_name, nip, phone_number, street_address, postal_code, city } = req.body;

    try {
        // Krok 1: Aktualizujemy dane w naszej lokalnej bazie danych (tak jak było)
        const result = await pool.query(
            `UPDATE users SET 
                first_name = $1, last_name = $2, company_name = $3, nip = $4, 
                phone_number = $5, street_address = $6, postal_code = $7, city = $8
             WHERE user_id = $9 RETURNING *`,
            [first_name, last_name, company_name, nip, phone_number, street_address, postal_code, city, userId]
        );
        
        const updatedUser = result.rows[0];

        // --- POCZĄTEK NOWEJ LOGIKI (2/2) ---
        // Krok 2: Sprawdzamy, czy użytkownik ma Stripe ID i synchronizujemy dane
        if (updatedUser.stripe_customer_id) {
            console.log(`Synchronizowanie danych dla klienta Stripe ID: ${updatedUser.stripe_customer_id}`);
            try {
                await stripe.customers.update(updatedUser.stripe_customer_id, {
                    name: company_name, // Nazwa firmy na fakturze
                    phone: phone_number,
                    address: {
                        line1: street_address,
                        postal_code: postal_code,
                        city: city,
                        country: updatedUser.country_code || 'PL', // Używamy kodu kraju z bazy lub domyślnie 'PL'
                    },
                    // Przekazujemy NIP jako europejski identyfikator podatkowy
                    tax_id_data: nip ? [{ type: 'eu_vat', value: nip }] : [],
                });
                console.log(`✅ Pomyślnie zaktualizowano dane klienta w Stripe.`);
            } catch (stripeError) {
                // Nawet jeśli aktualizacja w Stripe się nie uda, nie przerywamy operacji,
                // ale logujemy błąd, aby można było go naprawić.
                console.error(`❌ Błąd podczas aktualizacji klienta w Stripe:`, stripeError.message);
            }
        }
        // --- KONIEC NOWEJ LOGIKI (2/2) ---

        res.json(updatedUser);

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