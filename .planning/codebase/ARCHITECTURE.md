<!-- refreshed: 2025-05-25 -->
# Architecture

**Analysis Date:** 2025-05-25

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                        CLI Entry Point                       │
│            `src/check-availability.ts` — main()             │
└──────┬──────────────────────┬───────────────────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────────┐
│  Session     │    │  Calendar Fetch      │
│ getSession() │    │ fetchCalendarMonth() │
│              │    │  (×2, parallel)      │
└──────┬───────┘    └──────────┬───────────┘
       │  PHPSESSID +          │  CalendarDay[]
       │  visitor_id cookie    │
       └──────────────┬────────┘
                      ▼
          ┌───────────────────────┐
          │  Filter + Diff Logic  │
          │  (inside main())      │
          │  upcoming 14 days     │
          │  compare to cache     │
          └──────┬──────────┬─────┘
                 │          │
       new slots │          │ no new slots
                 ▼          ▼
       ┌──────────────┐  ┌────────────────┐
       │ buildMessage │  │ skip Telegram  │
       │ sendTelegram │  │                │
       └──────────────┘  └────────────────┘
                 │
                 ▼
       ┌──────────────────────────────────┐
       │  saveCache()                     │
       │  availability_cache.json (disk)  │
       └──────────────────────────────────┘
```

## Component Responsibilities

| Function | Responsibility | File |
|----------|----------------|------|
| `main()` | Orchestrates the full run: session → fetch → diff → notify → cache | `src/check-availability.ts:292` |
| `getSession()` | Scrapes PHPSESSID from rental page, activates township via SetProfileOption, returns combined cookie string | `src/check-availability.ts:79` |
| `fetchCalendarMonth()` | GET calendar API for a given year/month with session cookies, parses JSON into `CalendarDay[]` | `src/check-availability.ts:130` |
| `getUpcomingDateRange()` | Returns today..today+14 as `{ start, end }` Date objects | `src/check-availability.ts:174` |
| `formatDateNL()` | Formats ISO date string to Dutch locale string (e.g. "maandag 2 juni") | `src/check-availability.ts:183` |
| `normalizeTime()` | Strips trailing `:00` from time strings ("08:00:00 - 10:00:00" → "08:00 - 10:00") | `src/check-availability.ts:193` |
| `loadCache()` | Reads `availability_cache.json` from disk; returns empty `{}` on missing/corrupt file | `src/check-availability.ts:199` |
| `saveCache()` | Writes `Cache` object to `availability_cache.json` as formatted JSON | `src/check-availability.ts:210` |
| `sendTelegram()` | Sends an HTML-formatted message to the configured Telegram chat via raw `https.request` | `src/check-availability.ts:216` |
| `buildMessage()` | Builds the HTML Telegram message body from a `SlotRow[]`, using `<pre>` table layout | `src/check-availability.ts:263` |

## Pattern Overview

**Overall:** Single-file procedural CLI script — no framework, no server, no ORM.

**Key Characteristics:**
- All code lives in one TypeScript file; no module boundaries or imports between project files
- Executed directly with `tsx` (no compile step required)
- State is persisted entirely through a single JSON file on disk (`availability_cache.json`)
- Notification is fire-and-forget; the script exits after one full run

## Data Flow

### Primary Request Path

1. **Session acquisition** — GET `https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen` to obtain `PHPSESSID` cookie (`getSession()`, line 80)
2. **Township activation** — POST `https://www.acv-groep.nl/ajax/Filters/SetProfileOption` with `option=<TOWNSHIP>` to activate location in session and receive `visitor_id` cookie (`getSession()`, line 97)
3. **Calendar fetch** — GET `https://www.acv-groep.nl/ajax/RentalProducts/getCalendar` for current and next month in parallel (`fetchCalendarMonth()`, line 303)
4. **Filter** — Keep only days where `state === "available" | "semi"` and date falls within the next 14 days (`main()`, line 310)
5. **Diff against cache** — Load `availability_cache.json`; find dates or time slots not present in previous run (`main()`, line 332)
6. **Conditional notification** — If new/updated slots exist, call `buildMessage()` then `sendTelegram()` (`main()`, line 344)
7. **Cache update** — Write the current availability snapshot back to `availability_cache.json` (`saveCache()`, line 359)

### .env Bootstrap (local only)

1. On startup, if `.env` exists, parse it manually and inject into `process.env` (line 5–12)
2. In CI/cron, secrets come from the environment directly — `.env` is not present

## Key Abstractions

**`CalendarDay`:**
- Purpose: Represents one day returned by the ACV calendar API
- Fields: `date` (ISO), `state` (DayState), `parts` (optional `TimePart[]` with slot ids/times/status)
- Source: `src/check-availability.ts:46`

**`Cache` / `CacheEntry`:**
- Purpose: Persistent snapshot of previously seen available slots, keyed by ISO date
- Shape: `{ [date: string]: { state: DayState; slots: string[] } }`
- Source: `src/check-availability.ts:63–69`

**`SlotRow`:**
- Purpose: Derived view model for message rendering; adds `isNew` flag to indicate first-seen slots
- Source: `src/check-availability.ts:256`

## Entry Points

**Script entry:**
- Location: `src/check-availability.ts:363` — `main().catch(…)`
- Triggers: `npm run check` (runs `tsx src/check-availability.ts`)
- Responsibilities: Top-level error handler; exits with code 1 on fatal error

## External Dependencies

**ACV Groep website (scraping):**
- Rental page (session): `https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen`
- SetProfileOption API: `https://www.acv-groep.nl/ajax/Filters/SetProfileOption`
- Calendar API: `https://www.acv-groep.nl/ajax/RentalProducts/getCalendar`
- Auth: cookie-based session (`PHPSESSID` + `visitor_id`); no API key

**Telegram Bot API:**
- Endpoint: `https://api.telegram.org/bot<TOKEN>/sendMessage`
- Auth: `TELEGRAM_BOT_TOKEN` env var (token in URL path), `TELEGRAM_CHAT_ID` env var
- Client: raw Node.js `https.request` — no SDK

## State Management

- **Persistence:** Single JSON file — `availability_cache.json` in the working directory (project root)
- **Format:** `{ "YYYY-MM-DD": { "state": "available"|"semi", "slots": ["HH:MM - HH:MM", …] } }`
- **Lifecycle:** Loaded at start of `main()`, written at end of every successful run
- **Corruption handling:** Corrupt or missing cache treated as empty; triggers a notification on first run

## Architectural Constraints

- **Runtime:** Node.js 24+ (uses native `fetch`, `Promise.all`, ES2022 target)
- **Threading:** Single-threaded; two calendar month fetches are parallelised with `Promise.all` but everything else is sequential
- **Global state:** Module-level constants only (config values read from `process.env` at startup); no mutable globals
- **No build step:** `tsx` runs TypeScript directly; `tsc` is present for type-checking only
- **Working directory dependency:** `loadCache()` / `saveCache()` write relative to `process.cwd()` — the script must be run from project root

## Error Handling

**Strategy:** Best-effort with graceful degradation; fatal errors bubble to top-level `catch`.

**Patterns:**
- Missing `PHPSESSID`: `console.warn` + empty cookie string returned (calendar fetch will likely fail silently)
- Empty/non-JSON calendar response: `console.warn`/`console.error` + return `[]` (no crash)
- `SetProfileOption` non-success: `console.warn` only, execution continues
- Missing Telegram credentials: `console.error` + skip notification (cache is still updated)
- Any unhandled rejection in `main()`: caught at line 363, printed, exits with code 1

## Anti-Patterns

### Working-directory-relative cache path

**What happens:** `CACHE_FILE = "availability_cache.json"` is a bare filename with no path prefix; `readFileSync`/`writeFileSync` resolve it relative to `process.cwd()`.
**Why it's wrong:** The script fails silently or writes to the wrong location if invoked from any directory other than the project root (e.g., from a cron job using an absolute path with a different cwd).
**Do this instead:** Use `path.resolve(__dirname, "../availability_cache.json")` or `new URL("../availability_cache.json", import.meta.url)` to make the path absolute relative to the source file.

### Manual .env parsing

**What happens:** `.env` is parsed with a hand-rolled regex loop (lines 5–12) instead of a library like `dotenv`.
**Why it's wrong:** The parser does not handle multi-line values, comments mid-line, or `export` prefixes, making it fragile for non-trivial `.env` files.
**Do this instead:** Add `dotenv` as a dev dependency and call `dotenv.config()` at the top of the file.

---

*Architecture analysis: 2025-05-25*
