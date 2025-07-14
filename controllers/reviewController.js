// controllers/reviewController.js
const pool = require('../db');

## Pobieranie opinii dla profilu
// ZMIANA: Zapytanie odwołuje się do 'organizer_id' zamiast 'client_id'
exports.getReviewsForProfile = async (req, res) => {
    try {
        const { profileId } = req.params;
        const reviews = await pool.query(
            `SELECT r.review_id, r.rating, r.comment, r.created_at, u.first_name 
             FROM reviews r
             JOIN users u ON r.organizer_id = u.user_id
             WHERE r.profile_id = $1 
             ORDER BY r.created_at DESC`,
            [profileId]
        );
        res.json(reviews.rows);
    } catch (error) {
        console.error("Błąd podczas pobierania opinii:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

## Tworzenie nowej opinii
// ZMIANA: Cała logika dostosowana do rezerwacji food trucków
exports.createReview = async (req, res) => {
    try {
        const { request_id, rating, comment } = req.body;
        const organizerId = req.user.userId;

        // 1. Sprawdź, czy rezerwacja istnieje i należy do organizatora
        const requestQuery = await pool.query(
            'SELECT owner_id FROM booking_requests WHERE request_id = $1 AND organizer_id = $2',
            [request_id, organizerId]
        );

        if (requestQuery.rows.length === 0) {
            return res.status(403).json({ message: "Nie możesz wystawić opinii dla tej rezerwacji." });
        }
        
        const { owner_id } = requestQuery.rows[0];
        
        // 2. Znajdź profil food trucka na podstawie ID właściciela
        const profileQuery = await pool.query(
            'SELECT profile_id FROM food_truck_profiles WHERE owner_id = $1',
            [owner_id]
        );

        if (profileQuery.rows.length === 0) {
             return res.status(404).json({ message: "Nie znaleziono profilu food trucka do oceny." });
        }

        const { profile_id } = profileQuery.rows[0];

        // 3. Wstaw nową opinię, łącząc ją z profilem
        const newReview = await pool.query(
            `INSERT INTO reviews (profile_id, organizer_id, request_id, rating, comment)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [profile_id, organizerId, request_id, rating, comment]
        );

        res.status(201).json(newReview.rows[0]);
    } catch (error) {
        console.error("Błąd podczas tworzenia opinii:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};