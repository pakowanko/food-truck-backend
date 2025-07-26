const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Adres URL do API GUS jest poprawny
const GUS_API_URL = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';

// --- POCZĄTEK ZMIAN ---
// Zaktualizowane, poprawne adresy akcji (SOAP Actions) dla API w wersji BIR1.1
const GUS_API_LOGIN_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/Zaloguj';
const GUS_API_SEARCH_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/DaneSzukajPodmioty';
const GUS_API_LOGOUT_ACTION = 'http://CIS.BIR.PUBL.2014.07/IUslugaBIRzewnPubl/Wyloguj';
// --- KONIEC ZMIAN ---

async function getGusSession(apiKey) {
    if (!apiKey) {
        throw new Error('Brak klucza API do GUS (GUS_API_KEY).');
    }

    const loginXml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS.BIR.PUBL.2014.07">
                        <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
                            <wsa:To>${GUS_API_URL}</wsa:To>
                            <wsa:Action>${GUS_API_LOGIN_ACTION}</wsa:Action>
                        </soap:Header>
                        <soap:Body>
                            <ns:Zaloguj>
                                <ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika>
                            </ns:Zaloguj>
                        </soap:Body>
                    </soap:Envelope>`;

    const response = await axios.post(GUS_API_URL, loginXml, {
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' }
    });

    const parsedResponse = await parseStringPromise(response.data);
    const sid = parsedResponse['s:Envelope']['s:Body'][0].ZalogujResponse[0].ZalogujResult[0];
    return sid;
}

async function logoutGusSession(sid) {
     const logoutXml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS.BIR.PUBL.2014.07">
                          <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
                            <wsa:To>${GUS_API_URL}</wsa:To>
                            <wsa:Action>${GUS_API_LOGOUT_ACTION}</wsa:Action>
                          </soap:Header>
                          <soap:Body>
                            <ns:Wyloguj>
                              <ns:pIdentyfikatorSesji>${sid}</ns:pIdentyfikatorSesji>
                            </ns:Wyloguj>
                          </soap:Body>
                        </soap:Envelope>`;
    await axios.post(GUS_API_URL, logoutXml, { headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'sid': sid } });
}


exports.getCompanyDataByNip = async (req, res) => {
    const { nip } = req.params;
    console.log(`[GUS Controller] Otrzymano zapytanie o dane dla NIP: ${nip}`);
    
    let sid = null;
    try {
        const apiKey = process.env.GUS_API_KEY;
        sid = await getGusSession(apiKey);

        if (!sid) {
            return res.status(500).json({ message: 'Nie udało się uzyskać sesji z GUS.' });
        }

        const searchXml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS.BIR.PUBL.2014.07" xmlns:dat="http://CIS.BIR.PUBL.2014.07.DataContract">
                            <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
                                <wsa:To>${GUS_API_URL}</wsa:To>
                                <wsa:Action>${GUS_API_SEARCH_ACTION}</wsa:Action>
                            </soap:Header>
                            <soap:Body>
                                <ns:DaneSzukajPodmioty>
                                    <ns:pParametryWyszukiwania>
                                        <dat:Nip>${nip}</dat:Nip>
                                    </ns:pParametryWyszukiwania>
                                </ns:DaneSzukajPodmioty>
                            </soap:Body>
                        </soap:Envelope>`;

        const searchResponse = await axios.post(GUS_API_URL, searchXml, {
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'sid': sid }
        });
        
        const parsedSearch = await parseStringPromise(searchResponse.data);
        const searchResultXml = parsedSearch['s:Envelope']['s:Body'][0].DaneSzukajPodmiotyResponse[0].DaneSzukajPodmiotyResult[0];
        
        if (!searchResultXml || searchResultXml.trim() === '') {
            return res.status(404).json({ message: 'Nie znaleziono firmy o podanym numerze NIP.' });
        }

        const companyData = await parseStringPromise(searchResultXml, { explicitArray: false, ignoreAttrs: true });
        
        const data = companyData.root.dane;
        
        // Łączenie ulicy i numeru, z uwzględnieniem, że numer lokalu może istnieć lub nie
        const street = data.Ulica ? `${data.Ulica} ${data.NrNieruchomosci}${data.NrLokalu ? `/${data.NrLokalu}` : ''}`.trim() : (data.AdresPoczty || '');

        const formattedData = {
            company_name: data.Nazwa,
            street_address: street,
            postal_code: data.KodPocztowy,
            city: data.Miejscowosc,
        };

        res.status(200).json(formattedData);

    } catch (error) {
        console.error("Błąd podczas komunikacji z API GUS:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: "Błąd serwera podczas pobierania danych z GUS." });
    } finally {
        // Zgodnie z dobrymi praktykami, zawsze wylogowujemy sesję
        if (sid) {
            await logoutGusSession(sid);
            console.log('[GUS Controller] Sesja wylogowana.');
        }
    }
};