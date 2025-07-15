// index.js (Backend)
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const authRoutes = require('./routes/authRoutes');
const foodTruckProfileRoutes = require('./routes/foodTruckProfileRoutes');
const bookingRequestRoutes = require('./routes/bookingRequestRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

const app = express();

const corsOptions = {
  origin: 'https://pakowanko-1723651322373.web.app',
  optionsSuccessStatus: 200
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

// Ostateczna, poprawna konfiguracja tras z prefixami /api
app.use('/api/auth', authRoutes);
app.use('/api/profiles', foodTruckProfileRoutes);
app.use('/api/requests', bookingRequestRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/conversations', conversationRoutes);

app.get('/', (req, res) => {
  res.send('Backend for Food Truck Booking Platform is running!');
});

// Pełna logika Socket.IO
io.on('connection', (socket) => {
  console.log('✅ Użytkownik połączył się z komunikatorem:', socket.id);
  
  socket.on('join_room', (conversationId) => {
    socket.join(conversationId);
    console.log(`Użytkownik ${socket.id} dołączył do pokoju ${conversationId}`);
  });
  
  socket.on('send_message', async (data) => {
    const { conversation_id, sender_id, message_content } = data;
    try {
        const newMessage = await pool.query( 'INSERT INTO messages (conversation_id, sender_id, message_content) VALUES ($1, $2, $3) RETURNING *', [conversation_id, sender_id, message_content]);
        io.to(conversation_id).emit('receive_message', newMessage.rows[0]);
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