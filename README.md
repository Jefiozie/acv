# ACV Aanhanger Beschikbaarheid Checker

GitHub Action die elke 15 minuten de beschikbaarheid van ACV aanhangwagens controleert en je via Telegram notificeert zodra er nieuwe beschikbare datums verschijnen.

## Hoe het werkt

1. Haalt de ACV verhuurkalender op voor de huidige en volgende maand
2. Filtert op beschikbare datums in de komende 14 dagen
3. Vergelijkt met de vorige controle (gecached in GitHub Actions)
4. Stuurt alleen een Telegram-bericht als er **nieuw** beschikbare datums zijn

## Instellen

### 1. Fork of clone deze repository

```bash
gh repo fork jeffrey/acv-aanhanger
```

### 2. Voeg GitHub Secrets toe

Ga naar **Settings → Secrets and variables → Actions** en voeg toe:

| Secret                | Waarde                              |
| --------------------- | ----------------------------------- |
| `TELEGRAM_BOT_TOKEN`  | Token van je Telegram bot (via [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID`    | Jouw Telegram chat ID (via [@userinfobot](https://t.me/userinfobot)) |

### 3. Zorg dat Actions aan staan

Ga naar **Actions** tab in je repository en activeer workflows als dat nog niet het geval is.

## Configuratie aanpassen

Open `src/check-availability.ts` en pas de constanten bovenin aan:

```ts
const PRODUCT = "2";      // Product ID van de aanhangwagen
const TOWNSHIP = "1";     // Gemeente ID
const SITE = "1";         // Site ID
const LOOKAHEAD_DAYS = 14; // Aantal dagen vooruit kijken
```

## Voorbeeld Telegram-bericht

```
🚨 ACV Aanhanger — Nieuwe beschikbare datums!

✅ Nieuw beschikbaar (2x):
  • za. 30 mei
  • zo. 31 mei

📅 Alle beschikbare datums (komende 14 dagen):

Datum            Dag
───────────────────────
30 mei           zaterdag
31 mei           zondag
```

## Lokaal testen

```bash
npm install
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy npm run check
```

## API-respons debuggen

Als er geen beschikbare datums worden gevonden, controleer dan de console-output. Als de API een lege of onverwachte respons geeft, staat dit in de logs. De functie `parseCalendarResponse` in het script kan worden aangepast aan het werkelijke API-formaat.
