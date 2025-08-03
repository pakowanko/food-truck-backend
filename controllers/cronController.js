const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendPackagingReminderEmail, sendCreateProfileReminderEmail } = require('../utils/emailTemplate');
const { PubSub } = require('@google-cloud/pubsub');

const pubSubClient = new PubSub();
const topicName = 'reels-generation-topic';

exports.sendDailyReminders = async (req, res) => {
    console.log('[Cron] Uruchomiono zadanie wysyłania przypomnień o opakowaniach.');
    try {
        const result = await pool.query(
            `SELECT u.email AS owner_email, ftp.food_truck_name
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u ON ftp.owner_id = u.user_id
             WHERE br.status = 'confirmed' 
             AND (br.event_start_date = CURRENT_DATE + INTERVAL '14 days' OR br.event_start_date = CURRENT_DATE + INTERVAL '7 days')`
        );

        if (result.rows.length === 0) {
            console.log('[Cron] Nie znaleziono rezerwacji do przypomnienia o opakowaniach na dziś.');
            return res.status(200).send('Brak rezerwacji do przypomnienia o opakowaniach.');
        }

        for (const booking of result.rows) {
            await sendPackagingReminderEmail(booking.owner_email, booking.food_truck_name);
        }

        res.status(200).send(`Wysłano pomyślnie ${result.rows.length} przypomnień o opakowaniach.`);

    } catch (error) {
        console.error('[Cron] Błąd podczas wysyłania przypomnień o opakowaniach:', error);
        res.status(500).send('Błąd serwera podczas zadania cron.');
    }
};

exports.generateDailyInvoices = async (req, res) => {
    console.log('[Cron] Uruchomiono zadanie generowania faktur.');
    try {
        const result = await pool.query(
            `SELECT br.request_id, u.stripe_customer_id, u.country_code
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u ON ftp.owner_id = u.user_id
             WHERE br.status = 'confirmed' 
             AND br.invoice_generated = FALSE
             AND br.event_end_date = CURRENT_DATE - INTERVAL '1 day'`
        );

        if (result.rows.length === 0) {
            console.log('[Cron] Brak rezerwacji do zafakturowania.');
            return res.status(200).send('Brak rezerwacji do zafakturowania.');
        }

        const taxRateQuery = await pool.query('SELECT vat_rate FROM tax_rates WHERE country_code = $1', ['PL']);
        if (taxRateQuery.rows.length === 0) {
            console.error('[Cron] Nie znaleziono stawki podatkowej dla PL.');
            return res.status(500).send('Brak stawki podatkowej.');
        }
        const PLATFORM_COMMISSION_NET = 200.00;
        const vatRate = taxRateQuery.rows[0].vat_rate;
        const commissionGross = PLATFORM_COMMISSION_NET * (1 + vatRate / 100);

        for (const booking of result.rows) {
            if (process.env.STRIPE_SECRET_KEY && booking.stripe_customer_id) {
                
                await stripe.invoiceItems.create({
                    customer: booking.stripe_customer_id,
                    amount: Math.round(commissionGross * 100),
                    currency: 'pln',
                    description: `Prowizja za rezerwację #${booking.request_id}`,
                });
                const invoice = await stripe.invoices.create({
                    customer: booking.stripe_customer_id,
                    collection_method: 'send_invoice',
                    days_until_due: 7,
                    auto_advance: true,
                });
                await stripe.invoices.sendInvoice(invoice.id);

                await pool.query('UPDATE booking_requests SET invoice_generated = TRUE WHERE request_id = $1', [booking.request_id]);
                console.log(`[Cron] Wygenerowano i wysłano fakturę dla rezerwacji #${booking.request_id}`);
            }
        }
        res.status(200).send(`Wygenerowano ${result.rows.length} faktur.`);
    } catch (error) {
        console.error('[Cron] Błąd podczas generowania faktur:', error);
        res.status(500).send('Błąd serwera podczas zadania cron.');
    }
};

exports.sendProfileCreationReminders = async (req, res) => {
    console.log('[Cron] Uruchomiono zadanie wysyłania przypomnień o utworzeniu profilu.');
    try {
        // --- ZAKTUALIZOWANE ZAPYTANIE ---
        // Pobieramy teraz cały obiekt użytkownika (u.*), a nie tylko wybrane pola.
        const result = await pool.query(`
            SELECT u.*
            FROM users u
            LEFT JOIN food_truck_profiles p ON u.user_id = p.owner_id
            WHERE u.user_type = 'food_truck_owner' AND u.is_verified = TRUE
            GROUP BY u.user_id
            HAVING COUNT(p.profile_id) = 0
        `);

        if (result.rows.length === 0) {
            console.log('[Cron] Nie znaleziono właścicieli bez profili do przypomnienia.');
            return res.status(200).send('Brak użytkowników do przypomnienia.');
        }

        for (const user of result.rows) {
            // Przekazujemy cały obiekt 'user' do funkcji wysyłającej e-mail
            await sendCreateProfileReminderEmail(user);
        }

        console.log(`[Cron] Wysłano pomyślnie ${result.rows.length} przypomnień o utworzeniu profilu.`);
        res.status(200).send(`Wysłano pomyślnie ${result.rows.length} przypomnień.`);

    } catch (error) {
        console.error('[Cron] Błąd podczas wysyłania przypomnień o profilu:', error);
        res.status(500).send('Błąd serwera podczas zadania cron.');
    }
};

exports.publishAllExistingProfiles = async (req, res) => {
    console.log('[Admin] Uruchomiono zadanie wysyłania zleceń dla istniejących profili.');
    
    try {
        const profilesResult = await pool.query('SELECT * FROM food_truck_profiles');
        const profiles = profilesResult.rows;

        if (profiles.length === 0) {
            console.log('[Admin] Nie znaleziono żadnych profili do opublikowania.');
            return res.status(200).send('Brak profili do opublikowania.');
        }

        console.log(`[Admin] Znaleziono ${profiles.length} profili. Rozpoczynanie wysyłania zleceń...`);

        let successCount = 0;
        let failureCount = 0;

        for (const profile of profiles) {
            if (profile.gallery_photo_urls && profile.gallery_photo_urls.length > 0) {
                const dataBuffer = Buffer.from(JSON.stringify(profile));
                try {
                    await pubSubClient.topic(topicName).publishMessage({ data: dataBuffer });
                    console.log(`[Admin] Wysłano zlecenie backfill dla profilu: ${profile.food_truck_name}`);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                } catch (pubSubError) {
                    console.error(`[Admin] Nie udało się wysłać zlecenia backfill dla profilu ${profile.food_truck_name}. Błąd:`, pubSubError.message);
                    failureCount++;
                }
            } else {
                console.log(`[Admin] Pominięto profil ${profile.food_truck_name} (ID: ${profile.profile_id}) z powodu braku zdjęć.`);
            }
        }

        const summary = `Zakończono zadanie. Wysłano zleceń: ${successCount}. Błędy: ${failureCount}.`;
        console.log(`[Admin] ${summary}`);
        res.status(200).send(summary);

    } catch (error) {
        console.error('[Admin] Krytyczny błąd podczas zadania publikacji:', error);
        res.status(500).send('Błąd serwera podczas zadania publikacji.');
    }
};
