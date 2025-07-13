const pool = require('../db');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

const uploadFileToGCS = (file) => {
  return new Promise((resolve, reject) => {
    const { originalname, buffer } = file;
    const blob = bucket.file(`${Date.now()}_${originalname.replace(/ /g, "_")}`);
    const blobStream = blob.createWriteStream({ resumable: false });

    blobStream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    }).on('error', (err) => reject(`Nie udało się wysłać pliku: ${err}`)).end(buffer);
  });
};

async function geocode(postalCode) {
  const apiKey = process.env.GEOCODING_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(postalCode)}&components=country:PL&key=${apiKey}`;
  try {
    const response = await axios.get(url);
    if (response.data.status === 'OK') {
      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lon: lng };
    }
    throw new Error('Nie znaleziono współrzędnych dla kodu pocztowego.');
  } catch (error) {
    console.error('Błąd Geocoding API:', error.message);
    throw error;
  }
}

exports.createProfile = async (req, res) => {
    let { truck_name, description, base_postal_code, service_radius_km, cuisine_type, dietary_options, beverages, avg_price_range, website_url } = req.body;
    const ownerId = req.user.userId;

    try {
        let photoUrls = [];
        if (req.files && req.files.length > 0) {
          photoUrls = await Promise.all(req.files.map(uploadFileToGCS));
        }

        if (cuisine_type && typeof cuisine_type === 'string') cuisine_type = JSON.parse(cuisine_type);
        if (dietary_options && typeof dietary_options === 'string') dietary_options = JSON.parse(dietary_options);
        if (beverages && typeof beverages === 'string') beverages = JSON.parse(beverages);

        const { lat, lon } = await geocode(base_postal_code);

        const newProfile = await pool.query(
            `INSERT INTO truck_profiles (owner_id, truck_name, description, profile_image_url, base_postal_code, service_radius_km, base_latitude, base_longitude, cuisine_type, dietary_options, beverages, avg_price_range, website_url, reference_photo_urls) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [ownerId, truck_name, description, photoUrls[0] || null, base_postal_code, service_radius_km, lat, lon, cuisine_type, dietary_options, beverages, avg_price_range, website_url, photoUrls]
        );
        res.status(201).json(newProfile.rows[0]);
    } catch (error) {
        console.error('Błąd tworzenia profilu food trucka:', error.message);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.updateProfile = async (req, res) => {
    const { profileId } = req.params;
    let { truck_name, description, base_postal_code, service_radius_km, cuisine_type, dietary_options, beverages, avg_price_range, website_url } = req.body;
    
    try {
        const profileCheck = await pool.query("SELECT owner_id, reference_photo_urls FROM truck_profiles WHERE profile_id = $1", [profileId]);
        if (profileCheck.rows.length === 0) return res.status(404).json({ message: "Profil nie istnieje." });
        if (profileCheck.rows[0].owner_id !== req.user.userId) return res.status(403).json({ message: "Brak uprawnień." });

        let photoUrls = profileCheck.rows[0].reference_photo_urls || [];
        if (req.files && req.files.length > 0) {
          photoUrls = await Promise.all(req.files.map(uploadFileToGCS));
        }
        
        if (cuisine_type && typeof cuisine_type === 'string') cuisine_type = JSON.parse(cuisine_type);
        if (dietary_options && typeof dietary_options === 'string') dietary_options = JSON.parse(dietary_options);
        if (beverages && typeof beverages === 'string') beverages = JSON.parse(beverages);
        
        const { lat, lon } = await geocode(base_postal_code);

        const updatedProfile = await pool.query(
            `UPDATE truck_profiles SET truck_name = $1, description = $2, profile_image_url = $3, base_postal_code = $4, service_radius_km = $5, base_latitude = $6, base_longitude = $7, cuisine_type = $8, dietary_options = $9, beverages = $10, avg_price_range = $11, website_url = $12, reference_photo_urls = $13
             WHERE profile_id = $14 RETURNING *`,
            [truck_name, description, photoUrls[0] || profileCheck.rows[0].profile_image_url, base_postal_code, service_radius_km, lat, lon, cuisine_type, dietary_options, beverages, avg_price_range, website_url, photoUrls, profileId]
        );
        res.json(updatedProfile.rows[0]);
    } catch (error) {
        console.error("Błąd aktualizacji profilu:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getAllTrucks = async (req, res) => {
    try {
        const query = `
            SELECT p.*, COALESCE(AVG(r.rating), 0) as average_rating, COUNT(r.review_id) as review_count
            FROM truck_profiles p
            LEFT JOIN reviews r ON p.profile_id = r.profile_id
            GROUP BY p.profile_id
        `;
        const allTrucks = await pool.query(query);
        res.json(allTrucks.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getTruckById = async (req, res) => {
    try {
        const { profileId } = req.params;
        const truck = await pool.query("SELECT * FROM truck_profiles WHERE profile_id = $1", [profileId]);
        if (truck.rows.length === 0) return res.status(404).json({ message: "Nie znaleziono food trucka." });
        res.json(truck.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
};

exports.getMyTruck = async (req, res) => {
    try {
        const myTruck = await pool.query("SELECT * FROM truck_profiles WHERE owner_id = $1", [req.user.userId]);
        if (myTruck.rows.length === 0) return res.status(404).json({ message: "Nie utworzyłeś jeszcze profilu swojego food trucka." });
        res.json(myTruck.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
};