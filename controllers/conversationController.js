const pool = require('../db');

exports.getMyConversations = async (req, res) => {
    const { userId } = req.user;
    try {
        const result = await pool.query(
            `SELECT 
                c.conversation_id, 
                c.request_id,
                -- Tworzymy lepszy tytuł: jeśli jest rezerwacja, to nazwa food trucka; jeśli nie, to nazwa drugiej osoby
                COALESCE(ftp.food_truck_name, u_recipient.company_name, CONCAT(u_recipient.first_name, ' ', u_recipient.last_name), c.title) AS title
             FROM conversations c 
             -- Dołączamy dane drugiego uczestnika rozmowy
             JOIN users u_recipient ON u_recipient.user_id = (CASE WHEN c.participant_ids[1] = $1 THEN c.participant_ids[2] ELSE c.participant_ids[1] END)
             -- Opcjonalnie dołączamy dane rezerwacji i profilu, aby uzyskać nazwę food trucka
             LEFT JOIN booking_requests br ON c.request_id = br.request_id
             LEFT JOIN food_truck_profiles ftp ON br.profile_id = ftp.profile_id
             WHERE $1 = ANY(c.participant_ids) 
             ORDER BY c.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania konwersacji:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.initiateUserConversation = async (req, res) => {
    try {
        const { recipientId } = req.body;
        const senderId = req.user.userId;
        const recipientIdInt = parseInt(recipientId, 10);

        if (!recipientIdInt || recipientIdInt === senderId) {
            return res.status(400).json({ message: "Błędne dane." });
        }

        const existingConv = await pool.query(
            `SELECT * FROM conversations WHERE participant_ids @> ARRAY[$1::integer, $2::integer] AND request_id IS NULL`,
            [senderId, recipientIdInt]
        );

        if (existingConv.rows.length > 0) {
            return res.status(200).json(existingConv.rows[0]);
        }

        const recipientData = await pool.query('SELECT first_name, last_name, company_name FROM users WHERE user_id = $1', [recipientIdInt]);
        const title = recipientData.rows[0]?.company_name || `${recipientData.rows[0]?.first_name} ${recipientData.rows[0]?.last_name}`;

        const newConv = await pool.query(
            'INSERT INTO conversations (participant_ids, title) VALUES ($1, $2) RETURNING *',
            [[senderId, recipientIdInt], title]
        );
        res.status(201).json(newConv.rows[0]);
    } catch (error) {
        console.error("Błąd inicjowania konwersacji ogólnej:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.initiateBookingConversation = async (req, res) => {
    try {
        const { requestId } = req.body;
        const senderId = req.user.userId;

        const bookingQuery = await pool.query(
            `SELECT b.organizer_id, ftp.owner_id 
             FROM booking_requests b 
             JOIN food_truck_profiles ftp ON b.profile_id = ftp.profile_id 
             WHERE b.request_id = $1`,
            [requestId]
        );

        if (bookingQuery.rows.length === 0) {
            return res.status(404).json({ message: "Nie znaleziono rezerwacji." });
        }
        
        const { organizer_id, owner_id } = bookingQuery.rows[0];
        if (senderId !== organizer_id && senderId !== owner_id) {
            return res.status(403).json({ message: "Brak uprawnień."});
        }
        
        const existingConv = await pool.query('SELECT * FROM conversations WHERE request_id = $1', [requestId]);
        if (existingConv.rows.length > 0) {
            return res.status(200).json(existingConv.rows[0]);
        }
        
        const title = `Rezerwacja #${requestId}`;
        const newConv = await pool.query(
            'INSERT INTO conversations (participant_ids, title, request_id) VALUES ($1, $2, $3) RETURNING *',
            [[organizer_id, owner_id], title, requestId]
        );
        res.status(201).json(newConv.rows[0]);
    } catch (error) {
        console.error("Błąd inicjowania konwersacji o rezerwację:", error);
        res.status(500).json({ message: "Błąd serwera." });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;

        const convResult = await pool.query(
            'SELECT * FROM conversations WHERE conversation_id = $1 AND $2 = ANY(participant_ids)',
            [id, userId]
        );

        if (convResult.rows.length === 0) {
            return res.status(403).json({ message: "Brak dostępu do tej konwersacji." });
        }
        
        const messagesResult = await pool.query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [id]
        );
        
        res.status(200).json(messagesResult.rows);
    } catch (error) { 
        console.error("Błąd pobierania wiadomości:", error); 
        res.status(500).json({ message: "Błąd serwera." }); 
    }
};