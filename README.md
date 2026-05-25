# ACV Aanhanger Beschikbaarheid Checker

GitHub Action die elke 15 minuten de beschikbaarheid van ACV aanhangwagens controleert en je via Telegram notificeert zodra er nieuwe beschikbare tijdsloten verschijnen.

## Hoe het werkt

1. Verkrijgt een sessie op de ACV website (PHPSESSID + gemeente activeren)
2. Haalt de verhuurkalender op voor de huidige en volgende maand
3. Filtert beschikbare en gedeeltelijk beschikbare datums in de komende 30 dagen
4. Vergelijkt met de vorige controle (opgeslagen in een GitHub Gist)
5. Stuurt alleen een Telegram-bericht als er **nieuwe** tijdsloten zijn

## Datumstatussen

| Status | Betekenis |
|--------|-----------|
| `available` ✅ | Alle tijdsloten vrij |
| `semi` ⚡ | Gedeeltelijk vrij (minimaal 1 tijdslot beschikbaar) |
| `full` | Volgeboekt — geen melding |
| `unavailable` | Gesloten (zon-/feestdag) — geen melding |

## Instellen

### 1. Fork deze repository

### 2. Maak een GitHub Gist aan (eenmalig)

De cache wordt opgeslagen in een privé Gist zodat elke workflow-run de vorige staat kan lezen.

1. Ga naar https://gist.github.com
2. Maak een **secret gist** aan met bestandsnaam `acv-availability-cache.json` en inhoud `{}`
3. Kopieer de Gist ID uit de URL: `https://gist.github.com/<username>/<GIST_ID>`

### 3. Voeg GitHub Secrets toe

Ga naar **Settings → Secrets and variables → Actions**:

| Secret | Verplicht | Waarde |
|--------|-----------|--------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token van je Telegram bot (via [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | ✅ | Jouw Telegram chat ID (via [@userinfobot](https://t.me/userinfobot)) |
| `CACHE_GIST_ID` | ✅ | ID van de Gist die je in stap 2 aanmaakte |
| `TOWNSHIP` | ❌ | Gemeente ID (standaard: `16` = Ede) |

> `GITHUB_TOKEN` wordt automatisch door Actions aangemaakt — hoef je niet toe te voegen.

### 4. Activeer de workflow

Ga naar de **Actions** tab en activeer workflows als dat nog niet het geval is.

## Gemeente IDs

| ID | Gemeente |
|----|----------|
| 16 | Ede *(standaard)* |
| 17 | Renkum |
| 18 | Renswoude |
| 19 | Veenendaal |
| 20 | Wageningen |
| 38 | Scherpenzeel |

## Lokaal testen

Maak een `.env` bestand aan:

```env
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
TOWNSHIP=16
# optioneel voor lokaal testen met Gist:
# GITHUB_TOKEN=your_pat
# CACHE_GIST_ID=your_gist_id
```

Voer dan uit:

```bash
npm install
npm run check
```

Zonder `CACHE_GIST_ID` slaat het script de cache lokaal op in `availability_cache.json`.

## Voorbeeld Telegram-bericht

```
🚨 ACV Aanhanger — 2 nieuwe tijdslot(en) beschikbaar!
Komende 30 dagen — volledig overzicht

Datum                   Tijdsloten
──────────────────────────────────────────────
⚡ 🆕 maandag 8 juni        13:00 - 15:00
✅ 🆕 dinsdag 9 juni        08:00 - 10:00
                            10:30 - 12:30
                            13:00 - 15:00
✅     woensdag 10 juni      08:00 - 10:00
```
