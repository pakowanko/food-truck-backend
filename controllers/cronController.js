// controllers/cronController.js
const pool = require('../db');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendPackagingReminderEmail = async (recipientEmail, foodTruckName) => {
    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
        subject: `Przypomnienie: Zamów opakowania dla ${foodTruckName}`,
        html: `<h1>Pamiętaj o opakowaniach!</h1><p>Zbliża się termin Twojej rezerwacji dla food trucka <strong>${foodTruckName}</strong>.</p><p><strong>Pamiętaj, że zgodnie z regulaminem, jesteś zobowiązany do zakupu opakowań na to wydarzenie w naszym sklepie: <a href="https://www.pakowanko.com">www.pakowanko.com</a>.</strong></p><p>Prosimy o złożenie zamówienia z odpowiednim wyprzedzeniem.</p>`,
    };
    await sgMail.send(msg);
    console.log(`[Cron] Wysłano przypomnienie o opakowaniach do ${recipientEmail}`);
};

exports.sendDailyReminders = async (req, res) => {
    console.log('[Cron] Uruchomiono zadanie wysyłania przypomnień.');
    try {
        // ZMIANA: Szukamy rezerwacji na 14 LUB 7 dni przed wydarzeniem
        const result = await pool.query(
            `SELECT u.email AS owner_email, ftp.food_truck_name
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u ON ftp.owner_id = u.user_id
             WHERE br.status = 'confirmed' 
             AND (br.event_date = CURRENT_DATE + INTERVAL '14 days' OR br.event_date = CURRENT_DATE + INTERVAL '7 days')`
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