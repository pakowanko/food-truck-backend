const { Pool } = require('pg');
const dbConfig = require('../db');

exports.getMyConversations = async (req, res) => {
    const pool = new Pool(dbConfig);
    const client = await pool.connect();
    try {
        console.log(`[getMyConversations] Połączono z bazą dla użytkownika ID: ${req.user.userId}`);
        const { userId } = req.user;
        const result = await client.query(
            `SELECT c.conversation_id, c.title, c.request_id, u.user_id as recipient_id, u.first_name, u.last_name, u.company_name FROM conversations c JOIN users u ON u.user_id = (CASE WHEN c.participant_ids[1] = $1 THEN c.participant_ids[2] ELSE c.participant_ids[1] END) WHERE $1 = ANY(c.participant_ids) ORDER BY c.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Błąd pobierania konwersacji:", error);
        res.status(500).json({ message: "Błąd serwera." });
    } finally {
        if (client) client.release();
        await pool.end();
        console.log(`[getMyConversations] Połączenie z bazą zamknięte.`);
    }
};

exports.initiateUserConversation = async (req, res) => {
    const pool = new Pool(dbConfig);
    const client = await pool.connect();
    try {
        console.log('[initiateUserConversation] Połączono z bazą.');
        const { recipientId } = req.body;
        const senderId = req.user.userId;
        const recipientIdInt = parseInt(recipientId, 10);

        if (!recipientIdInt || recipientIdInt === senderId) return res.status(400).json({ message: "Błędne dane." });

        const existingConv = await client.query(
            `SELECT * FROM conversations WHERE participant_ids @> ARRAY[$1::integer, $2::integer] AND request_id IS NULL`,
            [senderId, recipientIdInt]
        );

        if (existingConv.rows.length > 0) return res.status(200).json(existingConv.rows[0]);

        const recipientData = await client.query('SELECT first_name, last_name, company_name FROM users WHERE user_id = $1', [recipientIdInt]);
        const title = recipientData.rows[0]?.company_name || `${recipientData.rows[0]?.first_name} ${recipientData.rows[0]?.last_name}`;

        const newConv = await client.query(
            'INSERT INTO conversations (participant_ids, title) VALUES ($1, $2) RETURNING *',
            [[senderId, recipientIdInt], title]
        );
        res.status(201).json(newConv.rows[0]);
    } catch (error) {
        console.error("Błąd inicjowania konwersacji ogólnej:", error);
        res.status(500).json({ message: "Błąd serwera." });
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('[initiateUserConversation] Połączenie z bazą zamknięte.');
    }
};

exports.initiateBookingConversation = async (req, res) => {
    const pool = new Pool(dbConfig);
    const client = await pool.connect();
    try {
        console.log(`[initiateBookingConversation] Połączono z bazą dla rezerwacji ID: ${req.body.requestId}`);
        const { requestId } = req.body;
        const senderId = req.user.userId;

        const bookingQuery = await client.query(`SELECT b.organizer_id, ftp.owner_id FROM booking_requests b JOIN food_truck_profiles ftp ON b.profile_id = ftp.profile_id WHERE b.request_id = $1`, [requestId]);
        if (bookingQuery.rows.length === 0) return res.status(404).json({ message: "Nie znaleziono rezerwacji." });
        
        const { organizer_id, owner_id } = bookingQuery.rows[0];
        if (senderId !== organizer_id && senderId !== owner_id) return res.status(403).json({ message: "Brak uprawnień."});
        
        const existingConv = await client.query('SELECT * FROM conversations WHERE request_id = $1', [requestId]);
        if (existingConv.rows.length > 0) return res.status(200).json(existingConv.rows[0]);
        
        const title = `Rezerwacja #${requestId}`;
        const newConv = await client.query(
            'INSERT INTO conversations (participant_ids, title, request_id) VALUES ($1, $2, $3) RETURNING *',
            [[organizer_id, owner_id], title, requestId]
        );
        res.status(201).json(newConv.rows[0]);
    } catch (error) {
        console.error("Błąd inicjowania konwersacji o rezerwację:", error);
        res.status(500).json({ message: "Błąd serwera." });
    } finally {
        if (client) client.release();
        await pool.end();
        console.log(`[initiateBookingConversation] Połączenie z bazą zamknięte.`);
    }
};

exports.getMessages = async (req, res) => {
    const pool = new Pool(dbConfig);
    const client = await pool.connect();
    try {
        console.log(`[getMessages] Połączono z bazą dla konwersacji ID: ${req.params.id}`);
        const { id } = req.params;
        const { userId } = req.user;
        const convResult = await client.query('SELECT * FROM conversations WHERE conversation_id = $1 AND $2 = ANY(participant_ids)', [id, userId]);
        if (convResult.rows.length === 0) {
            return res.status(403).json({ message: "Brak dostępu do tej konwersacji." });
        }
        const messagesResult = await client.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [id]);
        res.status(200).json(messagesResult.rows);
    } catch (error) { 
        console.error("Błąd pobierania wiadomości:", error); 
        res.status(500).json({ message: "Błąd serwera." }); 
    } finally {
        if (client) client.release();
        await pool.end();
        console.log(`[getMessages] Połączenie z bazą zamknięte.`);
    }
};