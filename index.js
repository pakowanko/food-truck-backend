require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const truckRoutes = require('./routes/truckRoutes');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/trucks', truckRoutes);

app.get('/', (req, res) => res.send('Backend for FoodTruck App is running!'));

app.listen(PORT, () => console.log(`🚀 Serwer Food Truck uruchomiony na porcie ${PORT}`));