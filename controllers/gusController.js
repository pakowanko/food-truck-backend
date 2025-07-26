const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Adresy URL do API GUS (środowisko produkcyjne)
const GUS_API_URL = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const GUS_API_LOGIN_ACTION = 'http://CIS.BIR.PUBL.2014.07.IUslugaBIRzewnPubl/Zaloguj';
const GUS_API_SEARCH_ACTION = 'http://CIS.BIR.PUBL.2014.07.IUslugaBIRzewnPubl/DaneSzukajPodmioty';

async function getGusSessionId() {
    const apiKey = process.env.GUS_API_KEY;
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
        headers: { 'Content-Type': 'application/soap+xml' }
    });

    const parsedResponse = await parseStringPromise(response.data);
    const sid = parsedResponse['s:Envelope']['s:Body'][0].ZalogujResponse[0].ZalogujResult[0];
    return sid;
}

exports.getCompanyDataByNip = async (req, res) => {
    const { nip } = req.params;
    console.log(`[GUS Controller] Otrzymano zapytanie o dane dla NIP: ${nip}`);

    try {
        const sid = await getGusSessionId();
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
            headers: { 'Content-Type': 'application/soap+xml', 'sid': sid }
        });
        
        const parsedSearch = await parseStringPromise(searchResponse.data);
        const searchResultXml = parsedSearch['s:Envelope']['s:Body'][0].DaneSzukajPodmiotyResponse[0].DaneSzukajPodmiotyResult[0];
        
        if (!searchResultXml || searchResultXml.trim() === '') {
            return res.status(404).json({ message: 'Nie znaleziono firmy o podanym numerze NIP.' });
        }

        const companyData = await parseStringPromise(searchResultXml, { explicitArray: false, ignoreAttrs: true });
        
        const data = companyData.root.dane;
        
        const street = data.Ulica ? `${data.Ulica} ${data.NrNieruchomosci}` : data.AdresPoczty;

        const formattedData = {
            company_name: data.Nazwa,
            street_address: street,
            postal_code: data.KodPocztowy,
            city: data.Miejscowosc
        };

        res.status(200).json(formattedData);

    } catch (error) {
        console.error("Błąd podczas komunikacji z API GUS:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: "Błąd serwera podczas pobierania danych z GUS." });
    }
};
