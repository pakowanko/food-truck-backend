// index.js (Backend)
require('dotenv').config();

// Import bibliotek
const express = require('express');
const http = require('http');
const cors = require('cors'); 
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const pool = require('./db');

// ZMIANA: Import modułów z trasami dostosowany do food trucków
const authRoutes = require('./routes/authRoutes');
const foodTruckProfileRoutes = require('./routes/foodTruckProfileRoutes'); // Zmieniono z installerProfileRoutes
const bookingRequestRoutes = require('./routes/bookingRequestRoutes'); // Zmieniono z serviceRequestRoutes
const reviewRoutes = require('./routes/reviewRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

// Inicjalizacja aplikacji
const app = express();

// ZMIANA: Konfiguracja CORS - PAMIĘTAJ O ZMIANIE TEGO ADRESU!
const corsOptions = {
  // UWAGA: Zezwalaj tylko Twojemu nowemu frontendowi
  origin: 'https://pakowanko-1723651322373.web.app', 
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Inne middleware
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  // ZMIANA: Konfiguracja CORS dla Socket.IO - PAMIĘTAJ O ZMIANIE TEGO ADRESU!
  cors: { 
    // UWAGA: Zezwalaj tylko Twojemu nowemu frontendowi
    origin: "https://twoja-nowa-aplikacja-foodtruck.web.app",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

// Konfiguracja dla wgrywanych plików (uploads)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// ZMIANA: Główne trasy API dostosowane do food trucków
app.use('/api/auth', authRoutes);
app.use('/api/profiles', foodTruckProfileRoutes); // Zmieniono zmienną
app.use('/api/requests', bookingRequestRoutes); // Zmieniono zmienną
app.use('/api/reviews', reviewRoutes);
app.use('/api/conversations', conversationRoutes);

// ZMIANA: Główna trasa powitalna
app.get('/', (req, res) => {
  res.send('Backend for Food Truck Booking Platform is running!');
});

// Logika Socket.IO dla komunikatora (bez zmian w logice)
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
    } catch (error) { console.error("Błąd zapisu/wysyłki wiadomości:", error); }
  });

  socket.on('disconnect', () => { console.log('❌ Użytkownik rozłączył się:', socket.id); });
});

// Uruchomienie serwera
server.listen(PORT, () => {
    console.log(`🚀 Serwer (z komunikatorem) uruchomiony na porcie ${PORT} i gotowy na przyjmowanie zapytań!`);
});

// Eksport serwera na potrzeby testów
module.exports = server;