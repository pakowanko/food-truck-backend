const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.getDashboardStats = async (req, res) => {
    try {
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const profileCount = await pool.query('SELECT COUNT(*) FROM food_truck_profiles');
        const bookingCount = await pool.query('SELECT COUNT(*) FROM booking_requests');
        const commissionSum = await pool.query("SELECT COUNT(*) * 200 as total FROM booking_requests WHERE commission_paid = TRUE");

        res.json({
            users: userCount.rows[0].count,
            profiles: profileCount.rows[0].count,
            bookings: bookingCount.rows[0].count,
            commission: commissionSum.rows[0].total || 0
        });
    } catch (error) {
        console.error("Błąd pobierania statystyk (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.user_id, u.email, u.user_type, u.first_name, u.last_name, 
                u.company_name, u.nip, u.street_address, u.postal_code, u.city, 
                u.is_blocked, u.role, COUNT(p.profile_id) as profile_count
            FROM users u
            LEFT JOIN food_truck_profiles p ON u.user_id = p.owner_id
            GROUP BY u.user_id
            ORDER BY u.user_id ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania użytkowników (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT br.*, u_owner.company_name, u_organizer.email as organizer_email
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u_owner ON ftp.owner_id = u_owner.user_id
             JOIN users u_organizer ON br.organizer_id = u_organizer.user_id
             ORDER BY br.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania rezerwacji (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.toggleUserBlock = async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'UPDATE users SET is_blocked = NOT is_blocked WHERE user_id = $1 RETURNING user_id, is_blocked',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono użytkownika.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu blokady użytkownika:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.updateUser = async (req, res) => {
    const { userId } = req.params;
    const { company_name, nip, street_address, postal_code, city, user_type } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users SET 
                company_name = $1, 
                nip = $2, 
                street_address = $3, 
                postal_code = $4, 
                city = $5,
                user_type = $6
             WHERE user_id = $7 RETURNING *`,
            [company_name, nip, street_address, postal_code, city, user_type, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono użytkownika.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd aktualizacji użytkownika przez admina:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    
    if (parseInt(userId, 10) === req.user.userId) {
        return res.status(400).json({ message: "Nie możesz usunąć własnego konta administratora." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const profiles = await client.query('SELECT profile_id FROM food_truck_profiles WHERE owner_id = $1', [userId]);
        if (profiles.rows.length > 0) {
            const profileIds = profiles.rows.map(p => p.profile_id);
            await client.query('DELETE FROM reviews WHERE profile_id = ANY($1::int[])', [profileIds]);
            await client.query('DELETE FROM booking_requests WHERE profile_id = ANY($1::int[])', [profileIds]);
            await client.query('DELETE FROM food_truck_profiles WHERE owner_id = $1', [userId]);
        }

        await client.query('DELETE FROM reviews WHERE organizer_id = $1', [userId]);
        await client.query('DELETE FROM booking_requests WHERE organizer_id = $1', [userId]);
        await client.query('DELETE FROM messages WHERE sender_id = $1', [userId]);
        await client.query('DELETE FROM conversations WHERE $1 = ANY(participant_ids)', [userId]);

        const deleteResult = await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
        if (deleteResult.rowCount === 0) {
            throw new Error('Nie znaleziono użytkownika do usunięcia.');
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Użytkownik i wszystkie jego dane zostały pomyślnie usunięte.' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd podczas usuwania użytkownika przez admina:", error);
        res.status(500).json({ message: "Błąd serwera." });
    } finally {
        client.release();
    }
};

exports.updatePackagingStatus = async (req, res) => {
    const { requestId } = req.params;
    const { packaging_ordered } = req.body;
    try {
        const result = await pool.query(
            'UPDATE booking_requests SET packaging_ordered = $1 WHERE request_id = $2 RETURNING request_id, packaging_ordered',
            [packaging_ordered, requestId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu opakowań:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.updateCommissionStatus = async (req, res) => {
    const { requestId } = req.params;
    const { commission_paid } = req.body;
    try {
        const result = await pool.query(
            'UPDATE booking_requests SET commission_paid = $1 WHERE request_id = $2 RETURNING request_id, commission_paid',
            [commission_paid, requestId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu prowizji:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getAllConversations = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                c.conversation_id, 
                c.title,
                u1.email as participant1_email,
                u2.email as participant2_email
             FROM conversations c
             JOIN users u1 ON c.participant_ids[1] = u1.user_id
             JOIN users u2 ON c.participant_ids[2] = u2.user_id
             ORDER BY c.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania rozmów (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getConversationMessages = async (req, res) => {
    const { conversationId } = req.params;
    try {
        const messagesResult = await pool.query(
            `SELECT m.*, u.email as sender_email 
             FROM messages m
             JOIN users u ON m.sender_id = u.user_id
             WHERE m.conversation_id = $1 
             ORDER BY m.created_at ASC`, 
            [conversationId]
        );
        res.status(200).json(messagesResult.rows);
    } catch (error) { 
        console.error("Błąd pobierania wiadomości (admin):", error); 
        res.status(500).json({ message: "Błąd serwera." }); 
    }
};

exports.getUserProfiles = async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM food_truck_profiles WHERE owner_id = $1 ORDER BY food_truck_name', [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania profili użytkownika (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.deleteProfile = async (req, res) => {
    const { profileId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query('DELETE FROM reviews WHERE profile_id = $1', [profileId]);
        await client.query('DELETE FROM booking_requests WHERE profile_id = $1', [profileId]);
        
        const deleteResult = await client.query('DELETE FROM food_truck_profiles WHERE profile_id = $1', [profileId]);

        if (deleteResult.rowCount === 0) {
            throw new Error('Nie znaleziono profilu do usunięcia.');
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Profil został pomyślnie usunięty.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd podczas usuwania profilu (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    } finally {
        client.release();
    }
};
// Ta funkcja zastępuje poprzednią wersję handleStripeWebhook
exports.handleStripeWebhook = async (req, res) => {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
        console.log('BŁĄD: Brak klucza STRIPE_WEBHOOK_SECRET w zmiennych środowiskowych.');
        return res.status(400).send('Webhook secret not configured.');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`❌ Błąd weryfikacji webhooka Stripe: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`✅ Otrzymano zdarzenie Stripe: ${event.type}`);
    
    // Obsługa zdarzenia opłaconej faktury
    if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        console.log(`Faktura ${invoice.id} została opłacona.`);

        // --- POCZĄTEK NOWEJ LOGIKI ---

        // Pobierz pierwszą pozycję z faktury, aby znaleźć ID rezerwacji w opisie
        const lineItem = invoice.lines.data[0];
        
        if (lineItem && lineItem.description) {
            // Wyciągnij numer ID z opisu "Prowizja za rezerwację #123"
            const match = lineItem.description.match(/#(\d+)/);
            
            if (match && match[1]) {
                const requestId = parseInt(match[1], 10);
                console.log(`Znaleziono ID rezerwacji: ${requestId}. Aktualizowanie bazy danych...`);
                
                try {
                    // Zaktualizuj flagę commission_paid w tabeli booking_requests
                    const result = await pool.query(
                        'UPDATE booking_requests SET commission_paid = TRUE WHERE request_id = $1',
                        [requestId]
                    );
                    
                    if (result.rowCount > 0) {
                        console.log(`✅ Pomyślnie zaktualizowano status prowizji dla rezerwacji #${requestId}.`);
                    } else {
                        console.log(`⚠️ Nie znaleziono rezerwacji o ID #${requestId} do aktualizacji.`);
                    }

                } catch (dbError) {
                    console.error(`❌ Błąd podczas aktualizacji bazy danych dla rezerwacji #${requestId}:`, dbError);
                }
            } else {
                 console.error(`⚠️ Nie można było wyodrębnić ID rezerwacji z opisu faktury: "${lineItem.description}"`);
            }
        } else {
            console.error('⚠️ Faktura nie zawiera pozycji z opisem. Nie można zaktualizować statusu prowizji.');
        }
        // --- KONIEC NOWEJ LOGIKI ---
    }

    // Możesz tu dodać obsługę innych eventów, np. 'invoice.payment_failed'

    // Zwróć odpowiedź 200, aby potwierdzić otrzymanie zdarzenia
    res.json({ received: true });
};

// Tę funkcję dodaj na końcu pliku adminController.js
exports.syncAllUsersWithStripe = async (req, res) => {
    console.log('[SYNC] Rozpoczynam jednorazową synchronizację użytkowników ze Stripe...');
    
    try {
        // 1. Pobierz wszystkich właścicieli food trucków, którzy mają Stripe ID
        const { rows: users } = await pool.query(
            `SELECT user_id, email, company_name, nip, phone_number, street_address, postal_code, city, country_code, stripe_customer_id 
             FROM users 
             WHERE user_type = 'food_truck_owner' AND stripe_customer_id IS NOT NULL`
        );

        if (users.length === 0) {
            console.log('[SYNC] Nie znaleziono użytkowników do synchronizacji.');
            return res.status(200).send('Brak użytkowników do synchronizacji.');
        }

        console.log(`[SYNC] Znaleziono ${users.length} użytkowników do przetworzenia.`);
        let successCount = 0;
        let errorCount = 0;

        // 2. Przejdź pętlą przez każdego użytkownika
        for (const user of users) {
            try {
                // 3. Zaktualizuj dane w Stripe
                await stripe.customers.update(user.stripe_customer_id, {
                    name: user.company_name,
                    email: user.email,
                    phone: user.phone_number,
                    address: {
                        line1: user.street_address,
                        postal_code: user.postal_code,
                        city: user.city,
                        country: user.country_code || 'PL',
                    },
                    tax_id_data: user.nip ? [{ type: 'eu_vat', value: user.nip }] : [],
                });
                console.log(`[SYNC] ✅ Pomyślnie zsynchronizowano: ${user.email}`);
                successCount++;
            } catch (stripeError) {
                console.error(`[SYNC] ❌ Błąd dla użytkownika ${user.email} (Stripe ID: ${user.stripe_customer_id}):`, stripeError.message);
                errorCount++;
            }
        }
        
        const summary = `Synchronizacja zakończona. Sukces: ${successCount}, Błędy: ${errorCount}.`;
        console.log(`[SYNC] ${summary}`);
        res.status(200).send(summary);

    } catch (error) {
        console.error('[SYNC] Krytyczny błąd podczas synchronizacji:', error);
        res.status(500).send('Wystąpił krytyczny błąd serwera.');
    }
};