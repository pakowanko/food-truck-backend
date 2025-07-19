const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
function createBrandedEmail(title, bodyHtml) {
    const logoUrl = 'https://storage.googleapis.com/foodtruck_storage/Logo%20BookTheFoodTruck.jpeg'; 
    const contactEmail = 'info@bookthefoodtruck.eu';
    const websiteUrl = 'https://pakowanko-1723651322373.web.app';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5e5; }
                .header { background-color: #ffffff; padding: 20px; text-align: center; border-bottom: 1px solid #e5e5e5; }
                .header img { max-width: 180px; }
                .content { padding: 30px; }
                .content h1 { color: #333333; }
                .content p { line-height: 1.6; color: #555555; }
                .footer { background-color: #343a40; color: #ffffff; padding: 20px; text-align: center; font-size: 0.9em; }
                .footer a { color: #f0ad4e; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <a href="${websiteUrl}"><img src="${logoUrl}" alt="BookTheFoodTruck Logo"></a>
                </div>
                <div class="content">
                    <h1>${title}</h1>
                    ${bodyHtml}
                </div>
                <div class="footer">
                    <p>Z poważaniem,<br>Zespół BookTheFoodTruck</p>
                    <p><a href="mailto:${contactEmail}">${contactEmail}</a></p>
                    <p>&copy; ${new Date().getFullYear()} BookTheFoodTruck.eu - Wszelkie prawa zastrzeżone.</p>
                </div>
            </div>
        </body>
        </html>
    `;
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
        from: { email: process.env.SENDER_EMAIL, name: 'BookTheFoodTruck' },
        subject: title,
        html: finalHtml,
    };
    await sgMail.send(msg);
    console.log(`Wysłano przypomnienie o opakowaniach do ${recipientEmail}`);
}

module.exports = { createBrandedEmail, sendPackagingReminderEmail };