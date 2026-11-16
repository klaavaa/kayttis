# käyttis: Jääkaappini 🥬

Mobiilisovelluksen prototyyppi, jolla seurataan jääkaapin tuotteita ja niiden päiväyksiä, ettei ruokaa mene hukkaan.

## Käynnistys

```bash
python3 -m http.server 8000
# avaa http://localhost:8000
```

`index.html` aukeaa myös suoraan tiedostona, mutta asennus kotinäytölle, offline-tila ja puhelimen ilmoitukset vaativat palvelimen (http/https tai localhost).

## Ominaisuudet

**Tuotteet**
- Lisää tuote: nimi, kategoria, päiväys, määrä ja kuva. Kategoria arvataan nimestä (”jauheliha” → 🥩) ja aiemmin käytetyt nimet ehdotetaan.
- Pikavalinnat päiväykselle (huomenna, +3 pv, +1 vk …).
- Saman avaamattoman tuotteen lisääminen kasvattaa määrää uuden kortin sijaan.
- Muokkaa, merkitse avatuksi, käytä yksi kerrallaan, poista.
- **Kumoa**: jokaisen muutoksen jälkeen ilmoituksessa on Kumoa-painike.
- Haku, suodatus (syö pian, avatut, kategoria) ja järjestys (päiväys, nimi, viimeksi lisätty).

**Älykkäät päiväykset**
- *Parasta ennen* vai *viimeinen käyttöpäivä*: vanhentunut parasta ennen -tuote neuvoo ”katso, haista, maista”, viimeisen käyttöpäivän ylittänyt kehottaa olemaan syömättä.
- Avatulla tuotteella on oma säilyvyysaika kategorian mukaan (esim. maito 3 pv). Seurattava päiväys on se, kumpi tulee ensin.
- Kortin väri kertoo tilan: punainen = älä syö, oranssi = tarkista, keltainen = syö pian.

**Tilastot**
- Poistettaessa kysytään, syötiinkö tuote vai menikö se roskiin.
- Tilastot näyttävät kuukauden ja koko ajan pelastetun ruoan osuuden sekä useimmin roskiin menevät tuotteet.

**Sovellus**
- Asennettavissa kotinäytölle (PWA) ja toimii ilman verkkoyhteyttä.
- Puhelimen ilmoitukset pian vanhenevista tuotteista (kerran päivässä, kun sovellus avataan).
- Vaalea, tumma tai automaattinen teema.
- Muistutusaika valittavissa (1–7 pv).
- Varmuuskopio tiedostoon ja palautus tiedostosta.

## Tiedostot

| Tiedosto | Sisältö |
|---|---|
| `index.html` | Näkymät: tuotteet, lisää/muokkaa, tilastot, asetukset |
| `css/styles.css` | Ulkoasu ja teemat |
| `js/data.js` | Kategoriat, päiväyslogiikka ja tilastot (ei DOM-koodia) |
| `js/app.js` | Käyttöliittymä, tallennus, ilmoitukset, asetukset |
| `sw.js` | Service worker: offline-tila ja ilmoitusten avaus |
| `manifest.webmanifest`, `icons/` | Asennettavan sovelluksen tiedot ja kuvakkeet |

Tiedot tallentuvat selaimen `localStorage`-muistiin. Vanhan version tallentamat tuotteet siirtyvät uuteen muotoon automaattisesti.

## Rajoitukset

- Ilmoitukset tulevat, kun sovellus avataan. Taustailmoitukset sovelluksen ollessa kiinni vaatisivat palvelimen (Web Push).
- Säilyvyysajat ovat suuntaa-antavia. Tarkista aina pakkauksen merkinnät.
