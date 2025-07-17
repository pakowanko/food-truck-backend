// Poprawny import, pobieramy jedną, współdzieloną pulę połączeń
const pool = require('../db'); 

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

exports.createReview = async (req, res) => {
    const { request_id, rating, comment } = req.body;
    const organizerId = req.user.userId;

    try {
        // Używamy transakcji z puli połączeń
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const requestQuery = await client.query(
                'SELECT owner_id FROM booking_requests br JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id WHERE br.request_id = $1 AND br.organizer_id = $2',
                [request_id, organizerId]
            );

            if (requestQuery.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ message: "Nie możesz wystawić opinii dla tej rezerwacji." });
            }
            
            const { owner_id } = requestQuery.rows[0];
            
            const profileQuery = await client.query(
                'SELECT profile_id FROM food_truck_profiles WHERE owner_id = $1',
                [owner_id]
            );

            if (profileQuery.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: "Nie znaleziono profilu food trucka do oceny." });
            }

            const { profile_id } = profileQuery.rows[0];

            const newReview = await client.query(
                `INSERT INTO reviews (profile_id, organizer_id, request_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [profile_id, organizerId, request_id, rating, comment]
            );

            await client.query('COMMIT');
            res.status(201).json(newReview.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error; // Rzuć błąd dalej, aby został złapany przez zewnętrzny blok catch
        } finally {
            client.release(); // Zwalniamy klienta, ale NIE zamykamy puli
        }
    } catch (error) {
        console.error("Błąd podczas tworzenia opinii:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};