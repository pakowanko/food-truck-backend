const pool = require('../db');

exports.createReview = async (req, res) => {
    const { reservation_id, rating, comment } = req.body;
    const reviewer_id = req.user.userId;
    try {
        const reservationRes = await pool.query('SELECT truck_id, organizer_id FROM reservations WHERE reservation_id = $1', [reservation_id]);
        if (reservationRes.rows.length === 0) return res.status(404).json({ message: "Nie znaleziono rezerwacji." });
        if (reservationRes.rows[0].organizer_id !== reviewer_id) return res.status(403).json({ message: "Nie masz uprawnień do dodania opinii dla tej rezerwacji." });
        const truck_id = reservationRes.rows[0].truck_id;
        const newReview = await pool.query(
            'INSERT INTO reviews (reservation_id, truck_id, reviewer_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [reservation_id, truck_id, reviewer_id, rating, comment]
        );
        res.status(201).json(newReview.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Już dodałeś opinię dla tej rezerwacji.' });
        console.error("Błąd dodawania opinii:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};

exports.getReviewsForTruck = async (req, res) => {
    const { truckId } = req.params;
    try {
        const reviews = await pool.query(
            `SELECT r.rating, r.comment, r.created_at, u.first_name 
             FROM reviews r
             JOIN users u ON r.reviewer_id = u.user_id
             WHERE r.truck_id = $1 
             ORDER BY r.created_at DESC`,
            [truckId]
        );
        res.json(reviews.rows);
    } catch (error) {
        console.error("Błąd pobierania opinii:", error);
        res.status(500).json({ message: 'Błąd serwera.' });
    }
};