require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Importy tras bez zmian
const authRoutes = require('./routes/authRoutes');
const foodTruckProfileRoutes = require('./routes/foodTruckProfileRoutes');
const bookingRequestRoutes = require('./routes/bookingRequestRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const gusRoutes = require('./routes/gusRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const cronRoutes = require('./routes/cronRoutes');
const { censorContactInfo } = require('./utils/censor');
const { createBrandedEmail } = require('./utils/emailTemplate');

const app = express();

// Konfiguracja CORS jest już poprawna, zostawiamy ją bez zmian
const allowedOrigins = [
  'https://pakowanko-1723651322373.web.app',
  'https://app.bookthefoodtruck.eu'
];

const corsOptions = {
  origin: allowedOrigins,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Request Logger] Otrzymano zapytanie: ${req.method} ${req.originalUrl}`);
  next();
});

const server = http.createServer(app);

// Inicjalizacja Socket.IO jest już poprawna, zostawiamy ją bez zmian
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

// Konfiguracja statycznych plików bez zmian
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Rejestracja tras bez zmian
app.use('/api/auth', authRoutes);
app.use('/api/profiles', foodTruckProfileRoutes);
app.use('/api/requests', bookingRequestRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/gus', gusRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cron', cronRoutes);

app.get('/', (req, res) => {
  res.send('Backend for Food Truck Booking Platform is running!');
});

// --- ZAKTUALIZOWANA LOGIKA SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('✅ Użytkownik połączył się z Socket.IO:', socket.id);

  socket.on('register_user', (userId) => {
    // --- POPRAWKA: Sprawdzamy, czy userId nie jest puste ---
    // Zapobiega to błędowi "TypeError: Cannot read properties of null (reading 'toString')"
    if (userId) {
      socket.join(userId.toString());
      console.log(`Użytkownik ${socket.id} zarejestrowany w prywatnym pokoju ${userId}`);
    } else {
      console.warn(`Ostrzeżenie: Otrzymano próbę rejestracji z pustym userId od socketu: ${socket.id}`);
    }
  });
  
  socket.on('join_room', (conversationId) => {
    // --- POPRAWKA: Dodajemy zabezpieczenie również tutaj ---
    if (conversationId) {
      socket.join(conversationId);
      console.log(`Użytkownik ${socket.id} dołączył do pokoju czatu ${conversationId}`);
    } else {
      console.warn(`Ostrzeżenie: Otrzymano próbę dołączenia do pokoju z pustym conversationId od socketu: ${socket.id}`);
    }
  });

  // Logika send_message pozostaje bez zmian, jest już dobrze zabezpieczona
  socket.on('send_message', async (data) => {
    const { conversation_id, sender_id, message_content } = data;
    const censoredMessage = censorContactInfo(message_content);

    try {
        const newMessageQuery = await pool.query( 'INSERT INTO messages (conversation_id, sender_id, message_content) VALUES ($1, $2, $3) RETURNING *', [conversation_id, sender_id, censoredMessage]);
        const newMessage = newMessageQuery.rows[0];
        
        io.to(conversation_id).emit('receive_message', newMessage);

        const conversationQuery = await pool.query('SELECT participant_ids FROM conversations WHERE conversation_id = $1', [conversation_id]);
        const participantIds = conversationQuery.rows[0]?.participant_ids;
        
        if (participantIds) {
            const recipientId = participantIds.find(id => id !== sender_id);
            if (recipientId) {
                const senderQuery = await pool.query('SELECT first_name, company_name FROM users WHERE user_id = $1', [sender_id]);
                const sender = senderQuery.rows[0];
                const senderName = sender?.company_name || sender?.first_name || 'Użytkownik';

                const notificationData = {
                    senderName: senderName,
                    messagePreview: censoredMessage.substring(0, 50) + '...',
                    conversationId: conversation_id
                };
                
                io.to(recipientId.toString()).emit('new_message_notification', notificationData);
                console.log(`Wysłano powiadomienie o wiadomości do użytkownika ${recipientId}`);
            }
        }

        const roomSockets = await io.in(conversation_id).allSockets();
        if (roomSockets.size <= 1) {
            const recipientId = participantIds.find(id => id !== sender_id);
            if (recipientId) {
                const recipientQuery = await pool.query('SELECT email, first_name FROM users WHERE user_id = $1', [recipientId]);
                const senderQuery = await pool.query('SELECT first_name, company_name FROM users WHERE user_id = $1', [sender_id]);
                
                const recipient = recipientQuery.rows[0];
                const sender = senderQuery.rows[0];
                const senderName = sender?.company_name || sender?.first_name || 'Użytkownik';

                if (recipient?.email) {
                    const title = `Masz nową wiadomość od ${senderName}`;
                    const body = `<h1>Otrzymałeś nową wiadomość!</h1><p><strong>${senderName}</strong> napisał do Ciebie na czacie.</p><p>Zaloguj się na swoje konto, aby ją odczytać.</p>`;
                    const finalHtml = createBrandedEmail(title, body);

                    const msg = {
                        to: recipient.email,
                        from: {
                            email: process.env.SENDER_EMAIL,
                            name: 'BookTheFoodTruck'
                        },
                        subject: title,
                        html: finalHtml
                    };
                    await sgMail.send(msg);
                    console.log(`Wysłano powiadomienie email o nowej wiadomości do ${recipient.email}`);
                }
            }
        }
    } catch (error) { 
        console.error("Błąd zapisu/wysyłki wiadomości:", error); 
    }
  });
  
  socket.on('disconnect', () => { 
      console.log('❌ Użytkownik rozłączył się:', socket.id); 
  });
});

server.listen(PORT, () => {
    console.log(`🚀 Serwer (z komunikatorem) uruchomiony na porcie ${PORT} i gotowy na przyjmowanie zapytań!`);
});

module.exports = server;
