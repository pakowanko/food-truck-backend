// index.js (Backend)
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

const authRoutes = require('./routes/authRoutes');
const foodTruckProfileRoutes = require('./routes/foodTruckProfileRoutes');
const bookingRequestRoutes = require('./routes/bookingRequestRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const gusRoutes = require('./routes/gusRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

const corsOptions = {
  origin: 'https://pakowanko-1723651322373.web.app',
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Request Logger] Otrzymano zapytanie: ${req.method} ${req.originalUrl}`);
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://pakowanko-1723651322373.web.app",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/profiles', foodTruckProfileRoutes);
app.use('/api/requests', bookingRequestRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/gus', gusRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('Backend for Food Truck Booking Platform is running!');
});

io.on('connection', (socket) => {
  console.log('✅ Użytkownik połączył się z komunikatorem:', socket.id);
  
  socket.on('join_room', (conversationId) => {
    socket.join(conversationId);
    console.log(`Użytkownik ${socket.id} dołączył do pokoju ${conversationId}`);
  });

  socket.on('send_message', async (data) => {
    const { conversation_id, sender_id, message_content } = data;
    try {
        const newMessageQuery = await pool.query( 'INSERT INTO messages (conversation_id, sender_id, message_content) VALUES ($1, $2, $3) RETURNING *', [conversation_id, sender_id, message_content]);
        const newMessage = newMessageQuery.rows[0];
        
        io.to(conversation_id).emit('receive_message', newMessage);

        const roomSockets = await io.in(conversation_id).allSockets();
        if (roomSockets.size <= 1) {
            const conversationQuery = await pool.query('SELECT participant_ids FROM conversations WHERE conversation_id = $1', [conversation_id]);
            const participantIds = conversationQuery.rows[0]?.participant_ids;
            
            if (participantIds) {
                const recipientId = participantIds.find(id => id !== sender_id);
                if (recipientId) {
                    const recipientQuery = await pool.query('SELECT email, first_name FROM users WHERE user_id = $1', [recipientId]);
                    const senderQuery = await pool.query('SELECT first_name, company_name FROM users WHERE user_id = $1', [sender_id]);
                    
                    const recipient = recipientQuery.rows[0];
                    const sender = senderQuery.rows[0];
                    const senderName = sender?.company_name || sender?.first_name || 'Użytkownik';

                    if (recipient?.email) {
                        const msg = {
                            to: recipient.email,
                            from: {
                                email: process.env.SENDER_EMAIL,
                                name: 'BookTheFoodTruck'
                            },
                            subject: `Masz nową wiadomość od ${senderName}`,
                            html: `<h1>Otrzymałeś nową wiadomość!</h1><p><strong>${senderName}</strong> napisał do Ciebie na czacie.</p><p>Zaloguj się na swoje konto, aby ją odczytać.</p>`,
                        };
                        await sgMail.send(msg);
                        console.log(`Wysłano powiadomienie email o nowej wiadomości do ${recipient.email}`);
                    }
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
