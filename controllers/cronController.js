const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendPackagingReminderEmail } = require('../utils/emailTemplate');

exports.sendDailyReminders = async (req, res) => {
    console.log('[Cron] Uruchomiono zadanie wysyłania przypomnień.');
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
            console.log('[Cron] Nie znaleziono rezerwacji do przypomnienia na dziś.');
            return res.status(200).send('Brak rezerwacji do przypomnienia.');
        }

        for (const booking of result.rows) {
            await sendPackagingReminderEmail(booking.owner_email, booking.food_truck_name);
        }

        console.log(`[Cron] Wysłano pomyślnie ${result.rows.length} przypomnień.`);
        res.status(200).send(`Wysłano pomyślnie ${result.rows.length} przypomnień.`);

    } catch (error) {
        console.error('[Cron] Błąd podczas wysyłania przypomnień:', error);
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