const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// ... (stałe z adresami i akcjami pozostają bez zmian) ...
const GUS_API_URL = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const GUS_API_LOGIN_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/Zaloguj';
const GUS_API_SEARCH_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/DaneSzukajPodmioty';
const GUS_API_LOGOUT_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/Wyloguj';
const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

// Funkcje getGusSession i logoutGusSession pozostają bez zmian...
async function getGusSession(apiKey) {
    if (!apiKey) throw new Error('Brak klucza API do GUS (GUS_API_KEY).');
    const loginXml = `<soap:Envelope xmlns:soap="${SOAP_ENVELOPE_NS}" xmlns:ns="http://CIS.BIR.PUBL.2014.07"><soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:To>${GUS_API_URL}</wsa:To><wsa:Action>${GUS_API_LOGIN_ACTION}</wsa:Action></soap:Header><soap:Body><ns:Zaloguj><ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika></ns:Zaloguj></soap:Body></soap:Envelope>`;
    const response = await axios.post(GUS_API_URL, loginXml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' }, timeout: 15000 });
    const parsedResponse = await parseStringPromise(response.data);
    return parsedResponse['s:Envelope']['s:Body'][0].ZalogujResponse[0].ZalogujResult[0];
}
async function logoutGusSession(sid) {
    const logoutXml = `<soap:Envelope xmlns:soap="${SOAP_ENVELOPE_NS}" xmlns:ns="http://CIS.BIR.PUBL.2014.07"><soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:To>${GUS_API_URL}</wsa:To><wsa:Action>${GUS_API_LOGOUT_ACTION}</wsa:Action></soap:Header><soap:Body><ns:Wyloguj><ns:pIdentyfikatorSesji>${sid}</ns:pIdentyfikatorSesji></ns:Wyloguj></soap:Body></soap:Envelope>`;
    await axios.post(GUS_API_URL, logoutXml, { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'sid': sid }, timeout: 10000 });
}


exports.getCompanyDataByNip = async (req, res) => {
    const { nip } = req.params;
    console.log(`[GUS Controller] Otrzymano zapytanie o dane dla NIP: ${nip}`);
    
    // --- POCZĄTEK BLOKU DIAGNOSTYCZNEGO ---
    try {
        console.log('[DIAGNOSTYKA] Testowanie ogólnej łączności z internetem...');
        const googleRes = await axios.get('https://www.google.com', { timeout: 5000 });
        console.log(`[DIAGNOSTYKA] Połączenie z google.com udane. Status: ${googleRes.status}`);
    } catch (testError) {
        console.error('[DIAGNOSTYKA] Błąd połączenia z google.com. Problem z ogólnym dostępem do internetu.', testError.code);
    }
    // --- KONIEC BLOKU DIAGNOSTYCZNEGO ---
    
    let sid = null;
    try {
        const apiKey = process.env.GUS_API_KEY;
        sid = await getGusSession(apiKey);

        if (!sid) {
            return res.status(500).json({ message: 'Nie udało się uzyskać sesji z GUS.' });
        }

        const searchXml = `<soap:Envelope xmlns:soap="${SOAP_ENVELOPE_NS}" xmlns:ns="http://CIS.BIR.PUBL.2014.07" xmlns:dat="http://CIS.BIR.PUBL.2014.07.DataContract"><soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:To>${GUS_API_URL}</wsa:To><wsa:Action>${GUS_API_SEARCH_ACTION}</wsa:Action></soap:Header><soap:Body><ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${nip}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty></soap:Body></soap:Envelope>`;
        const searchResponse = await axios.post(GUS_API_URL, searchXml, { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'sid': sid }, timeout: 15000 });
        
        const parsedSearch = await parseStringPromise(searchResponse.data);
        const searchResultXml = parsedSearch['soap:Envelope']['soap:Body'][0].DaneSzukajPodmiotyResponse[0].DaneSzukajPodmiotyResult[0];
        
        if (!searchResultXml || searchResultXml.trim() === '') {
            return res.status(404).json({ message: 'Nie znaleziono firmy o podanym numerze NIP.' });
        }

        const companyData = await parseStringPromise(searchResultXml, { explicitArray: false, ignoreAttrs: true });
        const data = companyData.root.dane;
        const street = data.Ulica ? `${data.Ulica} ${data.NrNieruchomosci}${data.NrLokalu ? `/${data.NrLokalu}` : ''}`.trim() : (data.AdresPoczty || '');

        const formattedData = {
            company_name: data.Nazwa,
            street_address: street,
            postal_code: data.KodPocztowy,
            city: data.Miejscowosc,
        };

        res.status(200).json(formattedData);

    } catch (error) {
        // --- BARDZIEJ SZCZEGÓŁOWE LOGOWANIE BŁĘDU ---
        console.error("Błąd podczas komunikacji z API GUS. Szczegóły błędu:");
        if (error.response) {
            // Błąd z odpowiedzią od serwera (np. 4xx, 5xx)
            console.error('Status:', error.response.status);
            console.error('Dane:', error.response.data);
        } else if (error.request) {
            // Zapytanie wysłane, ale brak odpowiedzi (np. timeout)
            console.error('Brak odpowiedzi od serwera. Możliwy timeout lub blokada firewall.');
            console.error('Kod błędu:', error.code); // np. ETIMEDOUT
        } else {
            // Inny błąd
            console.error('Błąd:', error.message);
        }
        res.status(500).json({ message: "Błąd serwera podczas pobierania danych z GUS." });
    } finally {
        if (sid) {
            await logoutGusSession(sid);
            console.log('[GUS Controller] Sesja wylogowana.');
        }
    }
};