const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const PLATFORM_COMMISSION_NET = 200.00;

exports.createReservation = async (req, res) => {
    const { truck_id, event_date, event_details, estimated_guest_count, estimated_utility_costs } = req.body;
    const organizer_id = req.user.userId;
    try {
        const newReservation = await pool.query(
            'INSERT INTO reservations (truck_id, organizer_id, event_date, event_details, estimated_guest_count, estimated_utility_costs, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [truck_id, organizer_id, event_date, event_details, estimated_guest_count, estimated_utility_costs, 'pending_owner_approval']
        );
        res.status(201).json(newReservation.rows[0]);
    } catch (error) {
        console.error("Błąd tworzenia rezerwacji:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.updateReservationStatus = async (req, res) => {
    const { reservationId } = req.params;
    const { status } = req.body;
    const ownerId = req.user.userId;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const reservationQuery = await client.query(
          `SELECT r.*, u_owner.country_code, u_owner.stripe_customer_id, u_organizer.email as organizer_email, t.truck_name
           FROM reservations r 
           JOIN trucks t ON r.truck_id = t.truck_id 
           JOIN users u_owner ON t.owner_id = u_owner.user_id
           JOIN users u_organizer ON r.organizer_id = u_organizer.user_id
           WHERE r.reservation_id = $1 AND t.owner_id = $2`,
          [reservationId, ownerId]
        );
        if (reservationQuery.rows.length === 0) throw new Error('Nie masz uprawnień do zmiany tej rezerwacji.');
        const reservation = reservationQuery.rows[0];
        const updatedReservation = await client.query(
            'UPDATE reservations SET status = $1 WHERE reservation_id = $2 RETURNING *',
            [status, reservationId]
        );
        if (status === 'confirmed') {
            if (!reservation.stripe_customer_id) throw new Error("Ten właściciel nie ma konta klienta w Stripe.");
            const taxRateQuery = await client.query('SELECT vat_rate FROM tax_rates WHERE country_code = $1', [reservation.country_code]);
            if (taxRateQuery.rows.length === 0) throw new Error(`Nie znaleziono stawki VAT dla kraju: ${reservation.country_code}`);
            const vatRate = taxRateQuery.rows[0].vat_rate;
            const commissionGross = PLATFORM_COMMISSION_NET * (1 + vatRate / 100);
            await stripe.invoiceItems.create({
                customer: reservation.stripe_customer_id,
                amount: Math.round(commissionGross * 100), currency: 'pln',
                description: `Prowizja za rezerwację #${reservationId}`,
            });
            const invoice = await stripe.invoices.create({
                customer: reservation.stripe_customer_id, collection_method: 'send_invoice',
                days_until_due: 7, auto_advance: true,
            });
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            await client.query(
                `INSERT INTO invoices (reservation_id, owner_id, amount_net, vat_rate, amount_gross, stripe_invoice_id, due_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [reservationId, ownerId, PLATFORM_COMMISSION_NET, vatRate, commissionGross.toFixed(2), invoice.id, dueDate]
            );
            await stripe.invoices.sendInvoice(invoice.id);
            const msg = {
                to: reservation.organizer_email, from: process.env.SENDER_EMAIL,
                subject: `Twoja rezerwacja dla ${reservation.truck_name} została potwierdzona!`,
                html: `<h1>Rezerwacja Potwierdzona!</h1><p>Twoja rezerwacja na food trucka <strong>${reservation.truck_name}</strong> na dzień <strong>${new Date(reservation.event_date).toLocaleDateString()}</strong> została potwierdzona.</p>`,
            };
            await sgMail.send(msg);
        }
        await client.query('COMMIT');
        res.json(updatedReservation.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd aktualizacji statusu rezerwacji:", error);
        res.status(500).json({ message: error.message || 'Błąd serwera.' });
    } finally {
        client.release();
    }
};

exports.getMyReservations = async (req, res) => {
    const userId = req.user.userId;
    const userRole = req.user.role;
    try {
        let reservations;
        if (userRole === 'organizer') {
            reservations = await pool.query(
                'SELECT r.*, t.truck_name, t.owner_id FROM reservations r JOIN trucks t ON r.truck_id = t.truck_id WHERE r.organizer_id = $1 ORDER BY r.event_date DESC', 
                [userId]
            );
        } else { // owner
            reservations = await pool.query(
                'SELECT r.*, u.email as organizer_email, r.organizer_id FROM reservations r JOIN trucks t ON r.truck_id = t.truck_id JOIN users u ON r.organizer_id = u.user_id WHERE t.owner_id = $1 ORDER BY r.event_date DESC', 
                [userId]
            );
        }
        res.json(reservations.rows);
    } catch (error) {
        console.error("Błąd pobierania rezerwacji:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};