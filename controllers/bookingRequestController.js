// controllers/bookingRequestController.js
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const PLATFORM_COMMISSION_NET = 50.00; // Prowizja pozostaje 50 zł netto

// --- ZMIANA: Tworzenie nowej rezerwacji food trucka ---
exports.createBookingRequest = async (req, res) => {
    const { 
        profile_id, event_date, event_description,
        event_type, guest_count, event_location, event_time
    } = req.body;
    
    const organizerId = req.user.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query('SELECT phone_number FROM users WHERE user_id = $1', [organizerId]);
        const organizerPhone = userResult.rows[0]?.phone_number;

        const newRequestQuery = await client.query(
            `INSERT INTO booking_requests (
                profile_id, organizer_id, event_date, event_description, status,
                organizer_phone, event_type, guest_count,
                event_location, event_time
            ) VALUES ($1, $2, $3, $4, 'pending_owner_approval', $5, $6, $7, $8, $9) RETURNING *`,
            [
                profile_id, organizerId, event_date, event_description,
                organizerPhone, event_type, guest_count,
                event_location, event_time
            ]
        );
        const newRequest = newRequestQuery.rows[0];

        // Logika wysyłki maila do właściciela food trucka
        const ownerEmailQuery = await client.query(
            `SELECT u.email FROM users u JOIN food_truck_profiles ftp ON u.user_id = ftp.owner_id WHERE ftp.profile_id = $1`,
            [profile_id]
        );
        const ownerEmail = ownerEmailQuery.rows[0]?.email;

        if (ownerEmail) {
            const msg = {
                to: ownerEmail,
                from: process.env.SENDER_EMAIL,
                subject: 'Otrzymałeś nowe zapytanie o rezerwację!',
                html: `<h1>Nowa rezerwacja!</h1><p>Otrzymałeś nowe zapytanie o rezerwację food trucka w platformie. Zaloguj się na swoje konto, aby zobaczyć szczegóły.</p>`,
            };
            await sgMail.send(msg);
        }
        
        await client.query('COMMIT');
        res.status(201).json(newRequest);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Błąd tworzenia rezerwacji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas tworzenia rezerwacji.' });
    } finally {
        client.release();
    }
};


// --- ZMIANA: Aktualizacja statusu rezerwacji ---
exports.updateBookingStatus = async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;
    const ownerId = req.user.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const requestQuery = await client.query(
          `SELECT 
            br.*, 
            u_owner.country_code, 
            u_owner.stripe_customer_id, 
            u_owner.phone_number as owner_phone, 
            u_organizer.email as organizer_email, 
            ftp.food_truck_name
           FROM booking_requests br 
           JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
           JOIN users u_owner ON ftp.owner_id = u_owner.user_id
           JOIN users u_organizer ON br.organizer_id = u_organizer.user_id
           WHERE br.request_id = $1 AND ftp.owner_id = $2`,
          [requestId, ownerId]
        );

        if (requestQuery.rows.length === 0) {
            return res.status(403).json({ message: 'Nie masz uprawnień do zmiany tej rezerwacji.' });
        }
        
        const bookingRequest = requestQuery.rows[0];
        const updatedRequest = await client.query(
            'UPDATE booking_requests SET status = $1 WHERE request_id = $2 RETURNING *',
            [status, requestId]
        );

        if (status === 'confirmed') {
            // Logika faktury Stripe
            if (!bookingRequest.stripe_customer_id) throw new Error("Ten właściciel food trucka nie ma konta klienta w Stripe.");
            const taxRateQuery = await client.query('SELECT vat_rate FROM tax_rates WHERE country_code = $1', [bookingRequest.country_code]);
            if (taxRateQuery.rows.length === 0) throw new Error(`Nie znaleziono stawki VAT dla kraju: ${bookingRequest.country_code}`);
            
            const vatRate = taxRateQuery.rows[0].vat_rate;
            const commissionGross = PLATFORM_COMMISSION_NET * (1 + vatRate / 100);
            
            await stripe.invoiceItems.create({
                customer: bookingRequest.stripe_customer_id,
                amount: Math.round(commissionGross * 100),
                currency: 'pln',
                description: `Prowizja za rezerwację #${requestId}`,
            });
            const invoice = await stripe.invoices.create({
                customer: bookingRequest.stripe_customer_id,
                collection_method: 'send_invoice',
                days_until_due: 7,
                auto_advance: true,
            });
            await stripe.invoices.sendInvoice(invoice.id);

            // Logika wysyłki maila do organizatora
            const msg = {
                to: bookingRequest.organizer_email,
                from: process.env.SENDER_EMAIL,
                subject: `Twoja rezerwacja dla ${bookingRequest.food_truck_name} została potwierdzona!`,
                html: `<h1>Rezerwacja Potwierdzona!</h1>
                       <p>Twoja rezerwacja food trucka <strong>${bookingRequest.food_truck_name}</strong> została potwierdzona.</p>
                       <p>Możesz teraz skontaktować się bezpośrednio z właścicielem pod numerem telefonu: <strong>${bookingRequest.owner_phone}</strong> w celu umówienia szczegółów.</p>`,
            };
            await sgMail.send(msg);
        }

        await client.query('COMMIT');
        res.json(updatedRequest.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd aktualizacji statusu rezerwacji:", error);
        res.status(500).json({ message: error.message || 'Błąd serwera.' });
    } finally {
        client.release();
    }
};


// --- ZMIANA: Pobieranie rezerwacji ---
exports.getMyBookings = async (req, res) => {
    const userId = req.user.userId;
    const userRole = req.user.user_type;
    try {
        let query;
        const values = [userId];

        if (userRole === 'organizer') {
            query = `SELECT br.*, ftp.food_truck_name, ftp.owner_id FROM booking_requests br JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id WHERE br.organizer_id = $1 ORDER BY br.created_at DESC`;
        } else { // food_truck_owner
            query = `SELECT br.*, u.email as organizer_email, u.first_name as organizer_first_name, u.last_name as organizer_last_name, br.organizer_id, br.organizer_phone 
                     FROM booking_requests br 
                     JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id 
                     JOIN users u ON br.organizer_id = u.user_id 
                     WHERE ftp.owner_id = $1 
                     ORDER BY br.created_at DESC`;
        }
        
        const requests = await pool.query(query, values);
        res.json(requests.rows);
    } catch (error) {
        console.error("Błąd pobierania rezerwacji:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};