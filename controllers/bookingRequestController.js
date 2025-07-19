const pool = require('../db');
const sgMail = require('@sendgrid/mail');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Funkcja pomocnicza do wysyłania przypomnienia
const sendPackagingReminderEmail = async (recipientEmail, foodTruckName) => {
    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
        subject: `Przypomnienie: Zamów opakowania dla ${foodTruckName}`,
        html: `<h1>Pamiętaj o opakowaniach!</h1><p>Zbliża się termin Twojej rezerwacji dla food trucka <strong>${foodTruckName}</strong>.</p><p><strong>Pamiętaj, że zgodnie z regulaminem, jesteś zobowiązany do zakupu opakowań na to wydarzenie w naszym sklepie: <a href="https://www.pakowanko.com">www.pakowanko.com</a>.</strong></p><p>Prosimy o złożenie zamówienia z odpowiednim wyprzedzeniem.</p>`,
    };
    await sgMail.send(msg);
    console.log(`Wysłano przypomnienie o opakowaniach do ${recipientEmail}`);
};

// Tworzenie nowej rezerwacji
exports.createBookingRequest = async (req, res) => {
    console.log('[Controller: createBookingRequest] Uruchomiono tworzenie rezerwacji.');
    const { 
        profile_id, event_start_date, event_end_date, event_description,
        event_type, guest_count, event_location, event_time,
        utility_costs
    } = req.body;
    
    const organizerId = req.user.userId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query('SELECT phone_number FROM users WHERE user_id = $1', [organizerId]);
        const organizerPhone = userResult.rows[0]?.phone_number;

        const newRequestQuery = await client.query(
            `INSERT INTO booking_requests (
                profile_id, organizer_id, event_start_date, event_end_date, event_description, status,
                organizer_phone, event_type, guest_count,
                event_location, event_time, utility_costs
            ) VALUES ($1, $2, $3, $4, $5, 'pending_owner_approval', $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
                profile_id, organizerId, event_start_date, event_end_date, event_description,
                organizerPhone, event_type, parseInt(guest_count) || null,
                event_location, event_time, parseFloat(utility_costs) || null
            ]
        );
        const newRequest = newRequestQuery.rows[0];

        const ownerEmailQuery = await client.query(
            `SELECT u.email, ftp.food_truck_name FROM users u JOIN food_truck_profiles ftp ON u.user_id = ftp.owner_id WHERE ftp.profile_id = $1`,
            [profile_id]
        );
        const ownerEmail = ownerEmailQuery.rows[0]?.email;
        const foodTruckName = ownerEmailQuery.rows[0]?.food_truck_name;

        if (ownerEmail) {
            const msg = {
                to: ownerEmail,
                from: {
                    email: process.env.SENDER_EMAIL,
                    name: 'BookTheFoodTruck'
                },
                subject: `Nowa prośba o rezerwację dla ${foodTruckName}!`,
                html: `<h1>Otrzymałeś nowe zapytanie!</h1><p>Zaloguj się na swoje konto w BookTheFoodTruck, aby zobaczyć szczegóły nowej prośby o rezerwację.</p>`,
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
        if(client) client.release();
    }
};

// Aktualizacja statusu rezerwacji
exports.updateBookingStatus = async (req, res) => {
    console.log(`[Controller: updateBookingStatus] Aktualizacja statusu dla rezerwacji ID: ${req.params.requestId}`);
    const { requestId } = req.params;
    const { status } = req.body;
    const ownerId = req.user.userId;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const requestQuery = await client.query(
          `SELECT 
            br.*, 
            u_owner.email as owner_email,
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
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Nie masz uprawnień do zmiany tej rezerwacji.' });
        }
        
        const bookingRequest = requestQuery.rows[0];
        const updatedRequest = await client.query(
            'UPDATE booking_requests SET status = $1 WHERE request_id = $2 RETURNING *',
            [status, requestId]
        );

        if (status === 'confirmed') {
            if (bookingRequest.organizer_email) {
                const msg = {
                    to: bookingRequest.organizer_email,
                    from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
                    subject: `Twoja rezerwacja dla ${bookingRequest.food_truck_name} została POTWIERDZONA!`,
                    html: `<h1>Rezerwacja Potwierdzona!</h1><p>Dobra wiadomość! Twoja rezerwacja food trucka <strong>${bookingRequest.food_truck_name}</strong> na wydarzenie w dniu ${new Date(bookingRequest.event_start_date).toLocaleDateString()} została potwierdzona przez właściciela.</p>`,
                };
                await sgMail.send(msg);
            }

            if (bookingRequest.owner_email) {
                const msg = {
                    to: bookingRequest.owner_email,
                    from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
                    subject: `Potwierdziłeś rezerwację #${requestId}!`,
                    html: `<h1>Rezerwacja potwierdzona!</h1><p>Dziękujemy za potwierdzenie rezerwacji.</p><p><strong>Pamiętaj, że zgodnie z regulaminem, jesteś zobowiązany do zakupu opakowań na to wydarzenie w naszym sklepie: <a href="https://www.pakowanko.com">www.pakowanko.com</a>.</strong></p>`,
                };
                await sgMail.send(msg);
            }

            const today = new Date();
            const eventDate = new Date(bookingRequest.event_start_date);
            const daysUntilEvent = (eventDate.getTime() - today.getTime()) / (1000 * 3600 * 24);

            if (daysUntilEvent <= 7) {
                await sendPackagingReminderEmail(bookingRequest.owner_email, bookingRequest.food_truck_name);
            }
        
        } else if (status === 'rejected_by_owner') {
            if (bookingRequest.organizer_email) {
                const msg = {
                    to: bookingRequest.organizer_email,
                    from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
                    subject: `Twoja rezerwacja dla ${bookingRequest.food_truck_name} została odrzucona`,
                    html: `<h1>Rezerwacja Odrzucona</h1><p>Niestety, Twoja rezerwacja dla food trucka <strong>${bookingRequest.food_truck_name}</strong> na wydarzenie w dniu ${new Date(bookingRequest.event_start_date).toLocaleDateString()} została odrzucona przez właściciela.</p><p>Zachęcamy do wyszukania innego food trucka na naszej platformie!</p>`,
                };
                await sgMail.send(msg);
            }
        }

        await client.query('COMMIT');
        res.json(updatedRequest.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd aktualizacji statusu rezerwacji:", error);
        res.status(500).json({ message: error.message || 'Błąd serwera.' });
    } finally {
        if (client) client.release();
    }
};

exports.cancelBooking = async (req, res) => {
    const { requestId } = req.params;
    const { userId, user_type } = req.user;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const requestQuery = await client.query(
            `SELECT br.*, ftp.owner_id, u_owner.email as owner_email, u_organizer.email as organizer_email, ftp.food_truck_name
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u_owner ON ftp.owner_id = u_owner.user_id
             JOIN users u_organizer ON br.organizer_id = u_organizer.user_id
             WHERE br.request_id = $1`,
            [requestId]
        );

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ message: "Nie znaleziono rezerwacji." });
        }

        const booking = requestQuery.rows[0];

        if (userId !== booking.organizer_id && userId !== booking.owner_id) {
            return res.status(403).json({ message: "Brak uprawnień do anulowania tej rezerwacji." });
        }

        const newStatus = user_type === 'organizer' ? 'cancelled_by_organizer' : 'cancelled_by_owner';

        const updatedRequest = await client.query(
            'UPDATE booking_requests SET status = $1 WHERE request_id = $2 RETURNING *',
            [newStatus, requestId]
        );

        const recipientEmail = user_type === 'organizer' ? booking.owner_email : booking.organizer_email;
        const cancellerRole = user_type === 'organizer' ? 'Organizator' : 'Właściciel Food Trucka';

        const msg = {
            to: recipientEmail,
            from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
            subject: `Rezerwacja #${requestId} dla ${booking.food_truck_name} została ANULOWANA`,
            html: `<h1>Rezerwacja Anulowana</h1>
                   <p>Z przykrością informujemy, że rezerwacja #${requestId} dla food trucka <strong>${booking.food_truck_name}</strong>
                   na wydarzenie w dniu ${new Date(booking.event_start_date).toLocaleDateString()} została anulowana przez: <strong>${cancellerRole}</strong>.</p>
                   <p>Rezerwacja nie jest już aktywna w systemie.</p>`,
        };
        await sgMail.send(msg);

        await client.query('COMMIT');
        res.json(updatedRequest.rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Błąd podczas anulowania rezerwacji:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    } finally {
        if (client) client.release();
    }
};

exports.getMyBookings = async (req, res) => {
    const userId = req.user.userId;
    const userRole = req.user.user_type;
    try {
        const client = await pool.connect();
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
            
            const requests = await client.query(query, values);
            res.json(requests.rows);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Błąd pobierania rezerwacji:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};