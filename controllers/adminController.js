const pool = require('../db');

exports.getDashboardStats = async (req, res) => {
    try {
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const profileCount = await pool.query('SELECT COUNT(*) FROM food_truck_profiles');
        const bookingCount = await pool.query('SELECT COUNT(*) FROM booking_requests');
        // Załóżmy, że prowizja to stała kwota, np. 200 zł
        const commissionSum = await pool.query("SELECT COUNT(*) * 200 as total FROM booking_requests WHERE commission_paid = TRUE");

        res.json({
            users: userCount.rows[0].count,
            profiles: profileCount.rows[0].count,
            bookings: bookingCount.rows[0].count,
            commission: commissionSum.rows[0].total || 0
        });
    } catch (error) {
        console.error("Błąd pobierania statystyk (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, email, user_type, first_name, last_name, company_name, is_blocked, role FROM users ORDER BY user_id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania użytkowników (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT br.*, u_owner.company_name, u_organizer.email as organizer_email
             FROM booking_requests br
             JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             JOIN users u_owner ON ftp.owner_id = u_owner.user_id
             JOIN users u_organizer ON br.organizer_id = u_organizer.user_id
             ORDER BY br.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania rezerwacji (admin):", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.toggleUserBlock = async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'UPDATE users SET is_blocked = NOT is_blocked WHERE user_id = $1 RETURNING user_id, is_blocked',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono użytkownika.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu blokady użytkownika:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.updatePackagingStatus = async (req, res) => {
    const { requestId } = req.params;
    const { packaging_ordered } = req.body;
    try {
        const result = await pool.query(
            'UPDATE booking_requests SET packaging_ordered = $1 WHERE request_id = $2 RETURNING request_id, packaging_ordered',
            [packaging_ordered, requestId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu opakowań:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.updateCommissionStatus = async (req, res) => {
    const { requestId } = req.params;
    const { commission_paid } = req.body;
    try {
        const result = await pool.query(
            'UPDATE booking_requests SET commission_paid = $1 WHERE request_id = $2 RETURNING request_id, commission_paid',
            [commission_paid, requestId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Nie znaleziono rezerwacji.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Błąd zmiany statusu prowizji:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};