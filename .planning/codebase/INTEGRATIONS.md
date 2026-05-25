# External Integrations

**Analysis Date:** 2025-07-14

## APIs & External Services

### ACV Groep Website (acv-groep.nl)

Three distinct HTTP calls are made to `www.acv-groep.nl`, all implemented using the native `fetch` API in `src/check-availability.ts`.

---

**1. Rental Page (session bootstrap)**

- **URL:** `https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen`
- **Method:** `GET`
- **Purpose:** Establish a PHP session. The response `Set-Cookie` header yields `PHPSESSID`.
- **Auth:** None required for initial GET
- **Key headers sent:**
  ```
  User-Agent: Mozilla/5.0 (X11; Linux x86_64) … Chrome/124.0.0.0 …
  Accept: text/html,application/xhtml+xml,…
  ```
- **Key header received:** `Set-Cookie: PHPSESSID=<value>`
- **Source:** `src/check-availability.ts` lines 80–95 (`getSession()`)

---

**2. SetProfileOption API (township activation)**

- **URL:** `https://www.acv-groep.nl/ajax/Filters/SetProfileOption`
- **Method:** `POST`
- **Purpose:** Activates the configured municipality/township within the PHP session, which gates what calendar data the calendar API returns.
- **Auth:** `Cookie: PHPSESSID=<value>` from step 1
- **Request body:** `application/x-www-form-urlencoded` — `option=<TOWNSHIP_ID>` (default `"16"` = Ede, configured via `TOWNSHIP` env var)
- **Key headers sent:**
  ```
  Content-Type: application/x-www-form-urlencoded
  X-Requested-With: XMLHttpRequest
  Accept: application/json
  Referer: https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen
  Cookie: PHPSESSID=<value>
  ```
- **Key header received:** `Set-Cookie: visitor_id=<value>` — required for subsequent calendar calls
- **Response body:** `{ success: boolean }` JSON
- **Source:** `src/check-availability.ts` lines 97–125 (`getSession()`)

---

**3. Calendar API (availability data)**

- **URL:** `https://www.acv-groep.nl/ajax/RentalProducts/getCalendar?product=2&y=<year>&m=<month>&language=nl&township=<TOWNSHIP>&site=1`
- **Method:** `GET`
- **Purpose:** Returns day-by-day availability for trailer rental bookings for a given year/month.
- **Auth:** `Cookie: PHPSESSID=<value>; visitor_id=<value>` (both required)
- **Query parameters:**
  | Param      | Value              | Notes                       |
  |------------|--------------------|-----------------------------|
  | `product`  | `"2"`              | Hardcoded trailer product   |
  | `y`        | current/next year  | Numeric year                |
  | `m`        | current/next month | Numeric month (1–12)        |
  | `language` | `"nl"`             | Hardcoded Dutch             |
  | `township` | `TOWNSHIP` env var | Default `"16"` (Ede)        |
  | `site`     | `"1"`              | Hardcoded site identifier   |
- **Key headers sent:**
  ```
  X-Requested-With: XMLHttpRequest
  Accept: application/json, text/javascript, */*; q=0.01
  Referer: https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen
  Cookie: PHPSESSID=<value>; visitor_id=<value>
  ```
- **Response shape** (`CalendarResponse` interface, `src/check-availability.ts` lines 54–60):
  ```typescript
  interface CalendarResponse {
    valid: boolean;
    year: number;
    month: number;
    month_name: string;
    days: CalendarDay[];   // each day has: date, state, parts (time slots)
  }
  ```
  Day `state` values: `"available"` | `"semi"` | `"full"` | `"unavailable"`
  Each `parts` entry: `{ id, text: "08:00:00 - 10:00:00", status: "available" | "disabled" }`
- **Called twice in parallel** (current month + next month) via `Promise.all` at `src/check-availability.ts` lines 303–306
- **Source:** `src/check-availability.ts` lines 130–170 (`fetchCalendarMonth()`)

---

### Session Flow Summary

```
GET rental page  →  PHPSESSID
        ↓
POST SetProfileOption (PHPSESSID + township)  →  visitor_id
        ↓
GET calendar API (PHPSESSID + visitor_id)  →  availability JSON
```

All three steps execute within `main()` on every run. There is no session persistence between runs.

---

## Telegram Bot API

**Service:** Telegram Bot API  
**Endpoint:** `https://api.telegram.org/bot<TOKEN>/sendMessage`  
**Method:** `POST`  
**Purpose:** Deliver formatted HTML availability alerts to a Telegram chat when new time slots are detected.

**Implementation:** Uses Node.js built-in `https.request` (low-level) rather than `fetch`, wrapped in a `Promise`. This is the only place `https.request` is used; all other HTTP calls use native `fetch`.

- **Auth:** Bot token embedded in URL path — `/bot<TELEGRAM_BOT_TOKEN>/sendMessage`
- **Token source:** `TELEGRAM_BOT_TOKEN` environment variable (`src/check-availability.ts` line 30)
- **Chat target:** `TELEGRAM_CHAT_ID` environment variable (`src/check-availability.ts` line 31)

**Request headers:**
```
Content-Type: application/json
Content-Length: <byte length of body>
```

**Request body (JSON):**
```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "<HTML message string>",
  "parse_mode": "HTML"
}
```

**Message format:** HTML with `<b>`, `<i>`, and `<pre>` tags. The `<pre>` block renders a fixed-width table of dates and time slots. New slots are flagged with a 🆕 emoji.

**Response handling:**
- Parses JSON response `{ ok: boolean, description?: string }`
- Resolves on `ok: true`; rejects with `Error("Telegram error: <description>")` otherwise

**Source:** `src/check-availability.ts` lines 216–252 (`sendTelegram()`) and message builder lines 263–288 (`buildMessage()`)

---

## Data Storage

**Local cache file:**
- Path: `availability_cache.json` (relative to cwd, committed to repo as a persistent state snapshot)
- Format: `{ [date: string]: { state: DayState, slots: string[] } }`
- Written with `fs.writeFileSync` on every run
- Read with `fs.readFileSync` at startup to diff against current availability
- Source: `src/check-availability.ts` lines 199–212 (`loadCache()`, `saveCache()`)

---

## Authentication & Identity

**ACV Groep:** Cookie-based PHP session (`PHPSESSID` + `visitor_id`). Re-established from scratch on every script run — no persistence.

**Telegram:** Bot token in URL path. No OAuth or refresh flow.

---

## Environment Configuration

**Required environment variables:**
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (required to send notifications)
- `TELEGRAM_CHAT_ID` — Target chat or channel ID (required to send notifications)
- `TOWNSHIP` — Optional; municipality ID for ACV Groep filter (default: `"16"` = Ede)

**Loading:** `src/check-availability.ts` lines 5–12 parse `.env` from the working directory at startup. Variables already in the process environment take precedence (CI-safe).

---

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** Telegram `sendMessage` only (fire-and-forget, no webhook registration)

---

*Integration audit: 2025-07-14*
