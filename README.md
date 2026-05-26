# ACV Aanhanger Beschikbaarheid Checker

GitHub Action die elke 15 minuten de beschikbaarheid van ACV aanhangwagens controleert en je via Telegram notificeert zodra er nieuwe beschikbare tijdsloten verschijnen.

## Hoe het werkt

1. Verkrijgt een sessie op de ACV website (PHPSESSID + gemeente activeren)
2. Haalt de verhuurkalender op voor de huidige en volgende maand
3. Filtert beschikbare en gedeeltelijk beschikbare datums in de komende 30 dagen
4. Vergelijkt met de vorige controle (`availability_cache.json` in de repo)
5. Stuurt alleen een Telegram-bericht als er **nieuwe** tijdsloten zijn
6. Slaat de bijgewerkte cache op via een automatische commit terug naar de repo

## Datumstatussen

| Status | Betekenis |
|--------|-----------|
| `available` ✅ | Alle tijdsloten vrij |
| `semi` ⚡ | Gedeeltelijk vrij (minimaal 1 tijdslot beschikbaar) |
| `full` | Volgeboekt — geen melding |
| `unavailable` | Gesloten (zon-/feestdag) — geen melding |

## Instellen

### 1. Fork deze repository

### 2. Voeg GitHub Secrets toe

Ga naar **Settings → Secrets and variables → Actions**:

| Secret | Verplicht | Waarde |
|--------|-----------|--------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token van je Telegram bot (via [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | ✅ | Jouw Telegram chat ID (via [@userinfobot](https://t.me/userinfobot)) |
| `TOWNSHIP` | ❌ | Gemeente ID (standaard: `16` = Ede) |

### 3. Activeer de workflow

Ga naar de **Actions** tab en activeer workflows als dat nog niet het geval is.

Dat is alles — geen extra services of tokens nodig.

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
```

Dan:

```bash
npm install
npm run check
```


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

## Infrastructure

CDK-based AWS deployment (eu-central-1). Two stacks: `AcvStateful` (DynamoDB + SES) and `AcvBackend` (Lambda + EventBridge + API Gateway).

### One-time CDK bootstrap

Before deploying for the first time, check whether the account/region is already bootstrapped:

```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --region eu-central-1
```

If that command exits non-zero (stack not found), bootstrap the environment:

```bash
cd infrastructure && npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/eu-central-1
```

> ⚠️ Never use root AWS credentials for CDK. Use a scoped IAM user/role with the necessary permissions.

### Deploy

```bash
cd infrastructure && npx cdk deploy AcvStateful
cd infrastructure && npx cdk deploy AcvBackend
```

### Synthesise (local, no credentials required)

```bash
cd infrastructure && npx cdk synth
```

