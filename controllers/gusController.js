// controllers/gusController.js

exports.getCompanyDataByNip = async (req, res) => {
  const { nip } = req.params;
  console.log(`[GUS Controller] Otrzymano zapytanie o dane dla NIP: ${nip}`);

  // --- POCZĄTEK MIEJSCA NA PRAWDZIWĄ LOGIKĘ GUS ---
  // W przyszłości, gdy otrzymasz klucz, w tym miejscu znajdzie się
  // kod łączący się z API GUS za pomocą Twojego klucza.
  // Na razie symulujemy pomyślną odpowiedź.
  // --- KONIEC MIEJSCA NA PRAWDZIWĄ LOGIKĘ GUS ---

  // Symulujemy odpowiedź z serwera GUS
  try {
    const mockGusData = {
      company_name: "Przykładowa Firma z GUS Sp. z o.o.",
      street_address: "ul. Testowa 123",
      postal_code: "00-123",
      city: "Warszawa"
    };

    res.status(200).json(mockGusData);

  } catch (error) {
    console.error("Błąd w kontrolerze GUS (wersja testowa):", error);
    res.status(500).json({ message: "Błąd serwera w usłudze GUS." });
  }
};