const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Centralne miejsce do zarządzania adresami URL
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
    console.log(`Wysłano link do resetu hasła na adres ${recipientEmail}`);
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
    console.log(`Wysłano maila powitalnego (Google) na adres ${recipientEmail}`);
}

module.exports = { createBrandedEmail, sendVerificationEmail, sendPasswordResetEmail, sendGoogleWelcomeEmail };
