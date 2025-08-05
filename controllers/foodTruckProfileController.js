const pool = require('../db');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');

const pubSubClient = new PubSub();
const reelsTopicName = 'reels-generation-topic';
const postsTopicName = 'post-publication-topic';

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
            console.warn(`Nie udało się znaleźć współrzędnych dla lokalizacji: ${locationString}. Odpowiedź API: ${response.data.status}`);
            return { lat: null, lon: null };
        }
    } catch (error) {
        console.error('Błąd Geocoding API:', error.message);
        throw error;
    }
}

// --- ZAKTUALIZOWANA I ZOPTYMALIZOWANA FUNKCJA WYSZUKIWANIA ---
exports.getAllProfiles = async (req, res) => {
    const { cuisine, postal_code, event_start_date, event_end_date, min_rating, long_term_rental } = req.query;

    let query = `
        SELECT p.*, COALESCE(AVG(r.rating), 0) as average_rating, COUNT(r.review_id) as review_count
    `;
    const values = [];
    let fromClause = ` FROM food_truck_profiles p LEFT JOIN reviews r ON p.profile_id = r.profile_id`;
    const whereClauses = [];

    if (postal_code) {
        try {
            const { lat, lon } = await geocode(postal_code);
            if (lat && lon) {
                // --- OSTATECZNA POPRAWKA: Poprawiamy logikę placeholderów ---
                // 1. Najpierw dodajemy wartości do tablicy.
                values.push(lon, lat);
                // 2. Pobieramy ich indeksy (pamiętając, że placeholdery są 1-based).
                const lonIndex = values.length - 1;
                const latIndex = values.length;

                query += `,
                    CASE
                        WHEN p.base_longitude IS NOT NULL AND p.base_latitude IS NOT NULL THEN
                            ST_Distance(
                                ST_MakePoint(p.base_longitude, p.base_latitude)::geography,
                                ST_MakePoint($${lonIndex}, $${latIndex})::geography
                            ) / 1000
                        ELSE
                            NULL
                    END as distance
                `;
                
                whereClauses.push(`
                    p.base_longitude IS NOT NULL AND 
                    p.base_latitude IS NOT NULL AND
                    p.operation_radius_km IS NOT NULL AND
                    ST_DWithin(
                        ST_MakePoint(p.base_longitude, p.base_latitude)::geography,
                        ST_MakePoint($${lonIndex}, $${latIndex})::geography,
                        p.operation_radius_km * 1000
                    )
                `);
            }
        } catch (error) {
            return res.status(400).json({ message: "Nieprawidłowy kod pocztowy." });
        }
    }

    if (cuisine) {
        values.push(cuisine);
        whereClauses.push(`p.offer -> 'dishes' @> to_jsonb($${values.length}::text)`);
    }

    if (event_start_date && event_end_date) {
        values.push(event_start_date, event_end_date);
        whereClauses.push(`
            p.profile_id NOT IN (
                SELECT br.profile_id FROM booking_requests br 
                WHERE br.status = 'confirmed' AND 
                (br.event_start_date, br.event_end_date) OVERLAPS ($${values.length - 1}::DATE, $${values.length}::DATE)
            )
        `);
    }
    
    if (long_term_rental === 'true') {
        whereClauses.push(`p.long_term_rental_available = TRUE`);
    }

    query += fromClause;
    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }
    
    query += ' GROUP BY p.profile_id';
    
    if (min_rating && parseFloat(min_rating) > 0) {
        values.push(parseFloat(min_rating));
        query += ` HAVING COALESCE(AVG(r.rating), 0) >= $${values.length}`;
    }
    
    if (postal_code) {
        query += ' ORDER BY distance ASC';
    }

    // --- NOWOŚĆ: Dodajemy szczegółowe logowanie ---
    try {
        console.log('--- DEBUG: Wykonywanie zapytania SQL ---');
        console.log('QUERY:', query.replace(/\s+/g, ' ').trim()); // Logujemy zapytanie w jednej linii dla czytelności
        console.log('VALUES:', values);
        
        const profilesResult = await pool.query(query, values);

        console.log(`--- DEBUG: Zapytanie wykonane pomyślnie. Zwrócono ${profilesResult.rowCount} wierszy. ---`);
        res.json(profilesResult.rows);
    } catch (error) {
        console.error('--- KRYTYCZNY BŁĄD PODCZAS WYKONYWANIA ZAPYTANIA ---');
        // Logujemy szczegóły błędu z bazy danych
        console.error('BŁĄD:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            routine: error.routine,
        });
        // Logujemy również zapytanie, które spowodowało błąd
        console.error('GENEROWANE ZAPYTANIE:', query.replace(/\s+/g, ' ').trim());
        console.error('UŻYTE WARTOŚCI:', values);
        res.status(500).json({ message: 'Błąd serwera podczas wyszukiwania profili.' });
    }
};

exports.createProfile = async (req, res) => {
    let { food_truck_name, food_truck_description, base_location, operation_radius_km, offer, long_term_rental_available } = req.body;
    const ownerId = parseInt(req.user.userId, 10);

    if (!ownerId) {
        return res.status(403).json({ message: 'Brak autoryzacji do utworzenia profilu.' });
    }

    try {
        let galleryPhotoUrls = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(uploadFileToGCS);
            galleryPhotoUrls = await Promise.all(uploadPromises);
        }
        
        if (offer && typeof offer === 'string') offer = JSON.parse(offer);
        const isLongTerm = /true/i.test(long_term_rental_available);

        const { lat, lon } = await geocode(base_location);
        
        const newProfile = await pool.query(
            `INSERT INTO food_truck_profiles (owner_id, food_truck_name, food_truck_description, base_location, operation_radius_km, base_latitude, base_longitude, gallery_photo_urls, profile_image_url, offer, long_term_rental_available) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [ownerId, food_truck_name, food_truck_description, base_location, parseInt(operation_radius_km) || null, lat, lon, galleryPhotoUrls, galleryPhotoUrls[0] || null, offer, isLongTerm]
        );

        const newProfileData = newProfile.rows[0];

        if (newProfileData && newProfileData.gallery_photo_urls && newProfileData.gallery_photo_urls.length > 0) {
            const dataBuffer = Buffer.from(JSON.stringify(newProfileData));
            try {
                await pubSubClient.topic(reelsTopicName).publishMessage({ data: dataBuffer });
                console.log(`Wysłano zlecenie WYGENEROWANIA ROLKI dla profilu: ${newProfileData.food_truck_name}`);

                await pubSubClient.topic(postsTopicName).publishMessage({ data: dataBuffer });
                console.log(`Wysłano zlecenie PUBLIKACJI POSTA dla profilu: ${newProfileData.food_truck_name}`);

            } catch (error) {
                console.error(`Nie udało się wysłać zlecenia do Pub/Sub: ${error.message}`);
            }
        }

        res.status(201).json(newProfileData);

    } catch (error) {
        console.error('Błąd dodawania profilu food trucka:', error);
        res.status(500).json({ message: 'Błąd serwera lub nieprawidłowa lokalizacja.' });
    }
};

exports.updateProfile = async (req, res) => {
    const { profileId: profileIdParam } = req.params;
    let { food_truck_name, food_truck_description, base_location, operation_radius_km, offer, long_term_rental_available } = req.body;
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
            `UPDATE food_truck_profiles SET food_truck_name = $1, food_truck_description = $2, base_location = $3, operation_radius_km = $4, base_latitude = $5, base_longitude = $6, gallery_photo_urls = $7, profile_image_url = $8, offer = $9, long_term_rental_available = $10 WHERE profile_id = $11 RETURNING *`,
            [food_truck_name, food_truck_description, base_location, parseInt(operation_radius_km) || null, lat, lon, galleryPhotoUrls, galleryPhotoUrls[0] || null, offer, isLongTerm, profileId]
        );
        res.json(updatedProfile.rows[0]);
    } catch (error) {
        console.error("Błąd podczas aktualizacji profilu:", error);
        res.status(500).json({ message: 'Błąd serwera lub nieprawidłowa lokalizacja.' });
    }
};

exports.getMyProfiles = async (req, res) => {
    const { userId } = req.user;
    if (!userId) {
        return res.status(403).json({ message: 'Brak autoryzacji.' });
    }
    try {
        const profileResult = await pool.query('SELECT * FROM food_truck_profiles WHERE owner_id = $1 ORDER BY food_truck_name ASC', [userId]);
        res.json(profileResult.rows);
    } catch (error) {
        console.error("Błąd w /api/profiles/my-profiles:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getProfileById = async (req, res) => {
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
