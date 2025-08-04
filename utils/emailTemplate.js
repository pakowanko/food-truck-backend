const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const APP_URL = 'https://app.bookthefoodtruck.eu';
const LANDING_PAGE_URL = 'https://www.bookthefoodtruck.eu';
const PARTNER_URL = 'https://www.pakowanko.com';
    
function createBrandedEmail(title, bodyHtml) {
    const logoUrl = 'https://storage.googleapis.com/foodtruck_storage/Logo%20BookTheFoodTruck.jpeg'; 
    const contactEmail = 'info@bookthefoodtruck.eu';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5e5; }
                .header { background-color: #ffffff; padding: 20px; text-align: center; border-bottom: 1px solid #e5e5e5; }
                .header img { max-width: 180px; }
                .content { padding: 30px; }
                .content h1 { color: #333333; }
                .content p { line-height: 1.6; color: #555555; }
                .partner-section { padding: 20px 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e5e5e5; }
                .partner-section p { margin: 0; color: #6c757d; }
                .partner-section a { color: #333; font-weight: bold; }
                .footer { background-color: #343a40; color: #ffffff; padding: 20px; text-align: center; font-size: 0.9em; }
                .footer a { color: #f0ad4e; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <a href="${LANDING_PAGE_URL}"><img src="${logoUrl}" alt="Book The Food Truck Logo"></a>
                </div>
                <div class="content">
                    <h1>${title}</h1>
                    ${bodyHtml}
                </div>
                <div class="partner-section">
                    <p>Potrzebujesz ekologicznych opakowań na swoje wydarzenie?<br>Odwiedź naszego partnera <a href="${PARTNER_URL}" target="_blank">pakowanko.com</a>!</p>
                </div>
                <div class="footer">
                    <p>Z poważaniem,<br>Zespół Book The Food Truck</p>
                    <p><a href="mailto:${contactEmail}">${contactEmail}</a></p>
                    <p>&copy; ${new Date().getFullYear()} BookTheFoodTruck.eu - Wszelkie prawa zastrzeżone.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

async function sendVerificationEmail(recipientEmail, token) {
    const verificationUrl = `${APP_URL}/verify-email?token=${token}`;
    const title = 'Potwierdź swoje konto w Book The Food Truck';
    const body = `
        <p>Dziękujemy za rejestrację. Proszę, kliknij w poniższy przycisk, aby aktywować swoje konto:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 25px; background-color: #D9534F; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Aktywuj konto
        </a>
        <p>Jeśli przycisk nie działa, skopiuj i wklej ten link do przeglądarki:<br>${verificationUrl}</p>
    `;
    const finalHtml = createBrandedEmail(title, body);

    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'Book The Food Truck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
}

async function sendPasswordResetEmail(recipientEmail, token) {
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const title = 'Prośba o zresetowanie hasła';
    const body = `
        <p>Otrzymaliśmy prośbę o zresetowanie hasła dla Twojego konta.</p>
        <p>Kliknij w poniższy przycisk, aby ustawić nowe hasło. Link jest ważny przez jedną godzinę.</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 25px; background-color: #D9534F; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Zresetuj hasło
        </a>
        <p>Jeśli nie prosiłeś o zmianę hasła, zignoruj tę wiadomość.</p>
    `;
    const finalHtml = createBrandedEmail(title, body);

    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'Book The Food Truck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
}

async function sendGoogleWelcomeEmail(recipientEmail, firstName) {
    const title = `Witaj w Book The Food Truck, ${firstName}!`;
    const body = `
        <p>Twoje konto zostało pomyślnie utworzone za pomocą Google.</p>
        <p>Możesz teraz w pełni korzystać z platformy, wyszukiwać food trucki i dokonywać rezerwacji.</p>
        <a href="${APP_URL}" style="display: inline-block; padding: 12px 25px; background-color: #D9534F; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Przejdź do aplikacji
        </a>
    `;
    const finalHtml = createBrandedEmail(title, body);

    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'Book The Food Truck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
}

async function sendPackagingReminderEmail(recipientEmail, foodTruckName) {
    const title = `Przypomnienie: Zamów opakowania dla ${foodTruckName}`;
    const body = `
        <p>Zbliża się termin Twojej rezerwacji dla food trucka <strong>${foodTruckName}</strong>.</p>
        <p><strong>Pamiętaj, że zgodnie z regulaminem, jesteś zobowiązany do zakupu opakowań na to wydarzenie w naszym sklepie: <a href="https://www.pakowanko.com">www.pakowanko.com</a>.</strong></p>
        <p>Prosimy o złożenie zamówienia z odpowiednim wyprzedzeniem.</p>
    `;
    const finalHtml = createBrandedEmail(title, body);

    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'Book The Food Truck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
}

async function sendCreateProfileReminderEmail(recipientEmail, token) {
    const title = `Nie trać klientów na Book The Food Truck!`;
    const autoLoginUrl = `${APP_URL}/verify-email?reminder_token=${token}`;

    const body = `
        <p>Cześć,</p>
        <p>Zauważyliśmy, że zarejestrowałeś się na naszej platformie, ale nie utworzyłeś jeszcze profilu swojego food trucka. W międzyczasie, organizatorzy z Twojej okolicy aktywnie poszukują ofert na swoje wydarzenia!</p>
        <p>Nie pozwól, aby ominęły Cię potencjalne rezerwacje. Uzupełnienie profilu zajmuje tylko kilka minut, a dzięki niemu Twoja oferta stanie się widoczna dla setek organizatorów.</p>
        <a href="${autoLoginUrl}" style="display: inline-block; padding: 12px 25px; background-color: #D9534F; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Uzupełnij profil teraz
        </a>
        <p>Pokaż się klientom i zacznij zarabiać z Book The Food Truck!</p>
    `;
    const finalHtml = createBrandedEmail(title, body);

    const msg = {
        to: recipientEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'Book The Food Truck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
}

// --- NOWA FUNKCJA DO WYSYŁANIA POWIADOMIEŃ O REJESTRACJI ---

/**
 * Wysyła powiadomienie o nowej rejestracji na wewnętrzny adres e-mail.
 * @param {object} userData - Obiekt z danymi nowo zarejestrowanego użytkownika.
 */
async function sendNewUserAdminNotification(userData) {
    const adminEmail = 'pakowanko.info@gmail.com';
    const subject = `✅ Nowa rejestracja w BookTheFoodTruck: ${userData.email}`;

    const bodyHtml = `
        <h1>Nowy użytkownik!</h1>
        <p>W systemie zarejestrował się nowy użytkownik. Oto jego dane:</p>
        <ul>
            <li><strong>Email:</strong> ${userData.email || 'Brak'}</li>
            <li><strong>Typ konta:</strong> ${userData.user_type || 'Brak'}</li>
            <li><strong>Imię:</strong> ${userData.first_name || 'Brak'}</li>
            <li><strong>Nazwisko:</strong> ${userData.last_name || 'Brak'}</li>
            <li><strong>Nazwa firmy:</strong> ${userData.company_name || 'Brak'}</li>
            <li><strong>NIP:</strong> ${userData.nip || 'Brak'}</li>
            <li><strong>Telefon:</strong> ${userData.phone_number || 'Brak'}</li>
            <li><strong>Adres:</strong> ${userData.street_address || ''}, ${userData.postal_code || ''} ${userData.city || ''}</li>
        </ul>
    `;

    const msg = {
        to: adminEmail,
        from: { email: process.env.SENDER_EMAIL, name: 'System BookTheFoodTruck' },
        subject: subject,
        html: bodyHtml,
    };

    try {
        await sgMail.send(msg);
        console.log(`Powiadomienie o nowym użytkowniku (${userData.email}) wysłane do ${adminEmail}`);
    } catch (error) {
        console.error('Błąd podczas wysyłania powiadomienia o nowym użytkowniku:', error);
    }
}

// Eksportujemy wszystkie funkcje, w tym nową
module.exports = {
    createBrandedEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendGoogleWelcomeEmail,
    sendPackagingReminderEmail,
    sendCreateProfileReminderEmail,
    sendNewUserAdminNotification
};
