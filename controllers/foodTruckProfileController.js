const pool = require('../db');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

const uploadFileToGCS = (file) => {
  return new Promise((resolve, reject) => {
    const { originalname, buffer } = file;
    const blob = bucket.file(Date.now() + "_" + originalname.replace(/ /g, "_"));
    const blobStream = blob.createWriteStream({ resumable: false });
    blobStream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    }).on('error', (err) => {
      reject(`Nie udało się wysłać obrazka: ${err}`);
    }).end(buffer);
  });
};

async function geocode(locationString) {
    if (!locationString) return { lat: null, lon: null };
    const apiKey = process.env.GEOCODING_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationString)}&components=country:PL&key=${apiKey}`;
    try {
        const response = await axios.get(url);
        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            return { lat: location.lat, lon: location.lng };
        } else {
            console.warn(`Nie udało się znaleźć współrzędnych dla lokalizacji: ${locationString}.`);
            return { lat: null, lon: null };
        }
    } catch (error) {
        console.error('Błąd Geocoding API:', error.message);
        throw error;
    }
}

// ZMIANA: Uodporniona funkcja createProfile
exports.createProfile = async (req, res) => {
    console.log('[Controller: createProfile] Uruchomiono tworzenie profilu.');
    let { food_truck_name, food_truck_description, base_location, operation_radius_km, website_url, offer, long_term_rental_available } = req.body;
    const ownerId = req.user.userId;

    try {
        let galleryPhotoUrls = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(uploadFileToGCS);
            galleryPhotoUrls = await Promise.all(uploadPromises);
        }
        
        if (offer && typeof offer === 'string') offer = JSON.parse(offer);
        // Konwersja stringa 'true'/'false' na boolean
        const isLongTerm = /true/i.test(long_term_rental_available);

        const { lat, lon } = await geocode(base_location);
        
        const newProfile = await pool.query(
            `INSERT INTO food_truck_profiles (owner_id, food_truck_name, food_truck_description, base_location, operation_radius_km, base_latitude, base_longitude, website_url, gallery_photo_urls, profile_image_url, offer, long_term_rental_available) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [ownerId, food_truck_name, food_truck_description, base_location, operation_radius_km || null, lat, lon, website_url || null, galleryPhotoUrls, galleryPhotoUrls[0] || null, offer, isLongTerm]
        );
        res.status(201).json(newProfile.rows[0]);
    } catch (error) {
        console.error('Błąd dodawania profilu food trucka:', error);
        res.status(500).json({ message: 'Błąd serwera lub nieprawidłowa lokalizacja.' });
    }
};


// Pozostałe funkcje (updateProfile, getMyProfile, itd.)
// ... wklej tutaj resztę funkcji, które już masz i które są poprawne ...
// Wkleiłem je poniżej dla 100% pewności.

exports.updateProfile = async (req, res) => {
    console.log(`[Controller: updateProfile] Uruchomiono aktualizację profilu o ID: ${req.params.profileId}`);
    const { profileId: profileIdParam } = req.params;
    let { food_truck_name, food_truck_description, base_location, operation_radius_km, website_url, offer, long_term_rental_available } = req.body;
    const profileId = parseInt(profileIdParam, 10);
    
    if (isNaN(profileId)) return res.status(400).json({ message: 'Nieprawidłowe ID profilu.' });

    try {
        const profileCheck = await pool.query('SELECT owner_id, gallery_photo_urls FROM food_truck_profiles WHERE profile_id = $1', [profileId]);
        if (profileCheck.rows.length === 0) return res.status(404).json({ message: 'Profil nie istnieje.' });
        if (profileCheck.rows[0].owner_id !== req.user.userId) return res.status(403).json({ message: 'Nie masz uprawnień do edycji tego profilu.' });

        let galleryPhotoUrls = profileCheck.rows[0].gallery_photo_urls || [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(uploadFileToGCS);
            galleryPhotoUrls = await Promise.all(uploadPromises);
        }
        
        if (offer && typeof offer === 'string') offer = JSON.parse(offer);
        const isLongTerm = /true/i.test(long_term_rental_available);

        const { lat, lon } = await geocode(base_location);

        const updatedProfile = await pool.query(
            `UPDATE food_truck_profiles SET food_truck_name = $1, food_truck_description = $2, base_location = $3, operation_radius_km = $4, base_latitude = $5, base_longitude = $6, website_url = $7, gallery_photo_urls = $8, profile_image_url = $9, offer = $10, long_term_rental_available = $11 WHERE profile_id = $12 RETURNING *`,
            [food_truck_name, food_truck_description, base_location, operation_radius_km || null, lat, lon, website_url || null, galleryPhotoUrls, galleryPhotoUrls[0] || null, offer, isLongTerm, profileId]
        );
        res.json(updatedProfile.rows[0]);
    } catch (error) {
        console.error("Błąd podczas aktualizacji profilu:", error);
        res.status(500).json({ message: 'Błąd serwera lub nieprawidłowa lokalizacja.' });
    }
};

exports.getMyProfile = async (req, res) => {
    console.log(`[Controller: getMyProfile] Uruchomiono pobieranie własnego profilu dla użytkownika ID: ${req.user.userId}`);
    try {
        const profile = await pool.query('SELECT * FROM food_truck_profiles WHERE owner_id = $1', [req.user.userId]);
        if (profile.rows.length > 0) {
            res.json(profile.rows[0]);
        } else {
            res.status(404).json({ message: 'Nie znaleziono profilu dla tego użytkownika.' });
        }
    } catch (error) {
        console.error("Błąd w /api/profiles/my-profile:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getAllProfiles = async (req, res) => {
    console.log(`[Controller: getAllProfiles] Uruchomiono pobieranie wszystkich profili z filtrami:`, req.query);
    const { cuisine, postal_code } = req.query;

    let query = `
        SELECT 
            p.*, 
            COALESCE(AVG(r.rating), 0) as average_rating, 
            COUNT(r.review_id) as review_count
    `;
    const values = [];
    let fromClause = ` FROM food_truck_profiles p LEFT JOIN reviews r ON p.profile_id = r.profile_id`;
    const whereClauses = [];

    if (postal_code) {
        try {
            const { lat, lon } = await geocode(postal_code);
            if (lat && lon) {
                query += `, calculate_distance(p.base_latitude, p.base_longitude, $${values.length + 1}, $${values.length + 2}) as distance`;
                values.push(lat, lon);
                whereClauses.push(`calculate_distance(p.base_latitude, p.base_longitude, $1, $2) <= p.operation_radius_km`);
            }
        } catch (error) {
            return res.status(400).json({ message: "Nieprawidłowy kod pocztowy." });
        }
    }

    if (cuisine) {
        values.push(cuisine);
        whereClauses.push(`p.offer -> 'dishes' @> to_jsonb($${values.length}::text)`);
    }

    query += fromClause;
    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }
    query += ' GROUP BY p.profile_id';
    
    if (postal_code) {
        query += ' ORDER BY distance ASC';
    }

    try {
        const profilesResult = await pool.query(query, values);
        res.json(profilesResult.rows);
    } catch (error) {
        console.error('Błąd podczas pobierania wszystkich profili:', error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getProfileById = async (req, res) => {
  console.log(`[Controller: getProfileById] Uruchomiono pobieranie profilu o ID: ${req.params.profileId}`);
  try {
    const profileId = parseInt(req.params.profileId, 10);
    if (isNaN(profileId)) {
      return res.status(400).json({ message: 'Nieprawidłowe ID profilu.' });
    }
    const profile = await pool.query('SELECT * FROM food_truck_profiles WHERE profile_id = $1', [profileId]);
    if (profile.rows.length > 0) {
      res.json(profile.rows[0]);
    } else {
      res.status(404).json({ message: 'Nie znaleziono profilu o podanym ID.' });
    }
  } catch (error) {
    console.error("Błąd podczas pobierania pojedynczego profilu:", error);
    res.status(500).json({ message: 'Błąd serwera.' });
  }
};