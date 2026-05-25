# ACV Aanhanger Beschikbaarheid Checker

GitHub Action die elke 15 minuten de beschikbaarheid van ACV aanhangwagens controleert en je via Telegram notificeert zodra er nieuwe beschikbare tijdsloten verschijnen.

## Hoe het werkt

1. Verkrijgt een sessie op de ACV website (PHPSESSID + gemeente activeren)
2. Haalt de verhuurkalender op voor de huidige en volgende maand
3. Filtert beschikbare en gedeeltelijk beschikbare datums in de komende 30 dagen
4. Vergelijkt met de vorige controle (gecached in GitHub Actions)
5. Stuurt alleen een Telegram-bericht als er **nieuwe** tijdsloten zijn

## Datumstatussen

| Status | Betekenis |
|--------|-----------|
| `available` ✅ | Alle tijdsloten vrij |
| `semi` ⚡ | Gedeeltelijk vrij (minimaal 1 tijdslot beschikbaar) |
| `full` | Volgeboekt — geen melding |
| `unavailable` | Gesloten (zon-/feestdag) — geen melding |

## Instellen

### 1. Fork of clone deze repository

```bash
gh repo fork jeffrey/acv-aanhanger
```

### 2. Voeg GitHub Secrets toe

Ga naar **Settings → Secrets and variables → Actions** en voeg toe:

| Secret | Verplicht | Waarde |
|--------|-----------|--------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token van je Telegram bot (via [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | ✅ | Jouw Telegram chat ID (via [@userinfobot](https://t.me/userinfobot)) |
| `TOWNSHIP` | ❌ | Gemeente ID (standaard: `16` = Ede) |

### 3. Zorg dat Actions aan staan

Ga naar de **Actions** tab in je repository en activeer workflows als dat nog niet het geval is.

## Gemeente IDs

| ID | Gemeente |
|----|----------|
| 16 | Ede *(standaard)* |
| 17 | Renkum |
| 18 | Renswoude |
| 19 | Veenendaal |
| 20 | Wageningen |
| 38 | Scherpenzeel |

## Voorbeeld Telegram-bericht

```
🚨 ACV Aanhanger — 2 nieuwe tijdslot(en) beschikbaar!
Komende 14 dagen — volledig overzicht

Datum                   Tijdsloten
──────────────────────────────────────────────
⚡ 🆕 vrijdag 5 juni        08:00 - 10:00
✅ 🆕 maandag 8 juni        08:00 - 10:00
                            10:30 - 12:30
                            13:00 - 15:00
✅     dinsdag 9 juni        08:00 - 10:00
                            10:30 - 12:30
                            13:00 - 15:00
```

## Lokaal testen

```bash
npm install
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy TOWNSHIP=16 npm run check
```
