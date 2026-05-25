# Codebase Concerns

**Analysis Date:** 2025-07-15

---

## HIGH Severity

---

### Silent Execution After Session Failure

- **Severity:** HIGH
- **Description:** `getSession()` returns an empty string `""` when `PHPSESSID` cannot be obtained from the ACV website. Callers receive no thrown error — execution continues with `cookieString = ""`, causing both `fetchCalendarMonth` calls to proceed with no session cookie.
- **Location:** `src/check-availability.ts:90-95` (empty-string return), `src/check-availability.ts:295` (unchecked usage)
- **Impact:** Calendar API calls silently return `valid=false` or an empty response. No slots are detected, no notification is sent, and the cache is overwritten to empty — clearing previously seen slots. The next run will see everything as "new" and spam the Telegram chat.
- **Fix:** Throw an error (or call `process.exit(1)`) when `sessionId` is empty. Example:
  ```typescript
  if (!sessionId) {
    throw new Error("Could not obtain PHPSESSID — aborting");
  }
  ```

---

### Telegram Response JSON Parsed Without Try/Catch

- **Severity:** HIGH
- **Description:** Inside `sendTelegram`, `JSON.parse(data)` is called unconditionally on the raw response body with no error handling.
- **Location:** `src/check-availability.ts:238`
- **Impact:** If the Telegram API returns a non-JSON body (e.g., an HTML error page on a 5xx, or a truncated response), `JSON.parse` throws synchronously inside the `res.on('end')` callback. This rejects the Promise with an unhandled exception that propagates to `main()`, stopping the run with no useful diagnostic.
- **Fix:** Wrap the parse in a try/catch and include the raw body in the error message:
  ```typescript
  res.on("end", () => {
    try {
      const parsed = JSON.parse(data) as { ok: boolean; description?: string };
      if (parsed.ok) resolve();
      else reject(new Error(`Telegram API error: ${parsed.description}`));
    } catch {
      reject(new Error(`Telegram returned non-JSON: ${data.slice(0, 200)}`));
    }
  });
  ```

---

### SetProfileOption Failure Does Not Abort

- **Severity:** HIGH
- **Description:** When the `SetProfileOption` POST returns `success: false`, a warning is logged but `getSession()` continues and returns the cookie string as if everything worked.
- **Location:** `src/check-availability.ts:111-113`
- **Impact:** The township filter is not applied in the session. Subsequent calendar fetches silently return results for the wrong (or default) township, and no error or notification indicates the misconfiguration.
- **Fix:** Treat a non-success response as a fatal error:
  ```typescript
  if (!setBody.success) {
    throw new Error(`SetProfileOption failed for township=${TOWNSHIP}: ${JSON.stringify(setBody)}`);
  }
  ```

---

## MEDIUM Severity

---

### Debug `console.log` Left Inside `buildMessage`

- **Severity:** MEDIUM
- **Description:** A `console.log` statement that prints per-row processing details is embedded inside the pure message-builder function `buildMessage`.
- **Location:** `src/check-availability.ts:275`
- **Impact:** Every Telegram notification run emits one line to stdout per available day, mixing internal implementation details into the operational log. This makes log output noisy and leaks internal data (state, slot strings) that are not useful to an operator.
- **Fix:** Remove the line entirely. If per-row debugging is needed, add it at the call site in `main()` under a `DEBUG` env-var guard, or keep it only in development.

---

### No Retry Logic on Network Calls

- **Severity:** MEDIUM
- **Description:** All HTTP calls — `fetch(RENTAL_PAGE_URL)`, `fetch(SET_PROFILE_URL)`, `fetchCalendarMonth()`, and `sendTelegram()` — are single-attempt with no retry or backoff.
- **Location:** `src/check-availability.ts:80`, `97`, `137`, `216`
- **Impact:** A transient network hiccup, a brief ACV server timeout, or a Telegram rate-limit (429) will abort the entire run. The cache will not be updated, meaning the next scheduled run may send duplicate notifications for slots already seen.
- **Fix:** Wrap the two ACV `fetch` calls and `sendTelegram` in a simple retry loop (2–3 attempts, exponential backoff). The [`p-retry`](https://github.com/sindresorhus/p-retry) package is minimal and well-suited for this.

---

### No Input Validation on `TOWNSHIP` Env Var

- **Severity:** MEDIUM
- **Description:** The `TOWNSHIP` value is read from `process.env.TOWNSHIP` and inserted directly into both a POST body and a URL query string without any validation.
- **Location:** `src/check-availability.ts:24` (assignment), `src/check-availability.ts:108` (POST body), `src/check-availability.ts:135` (URL)
- **Impact:** A misconfigured or maliciously set `TOWNSHIP` value could result in a URL injection or unexpected API behaviour. At minimum, a non-numeric value will silently produce bad API requests.
- **Fix:** Validate that `TOWNSHIP` is a numeric string before use:
  ```typescript
  if (!/^\d+$/.test(TOWNSHIP)) {
    throw new Error(`Invalid TOWNSHIP value: "${TOWNSHIP}". Must be a numeric ID.`);
  }
  ```

---

### Cache Commit Race Condition on Concurrent Workflow Runs

- **Severity:** MEDIUM
- **Description:** The `workflow_dispatch` trigger allows manual runs at any time, potentially overlapping with a scheduled run. Both jobs check out the same commit, read the same `availability_cache.json`, find the same "new" slots, and both push a cache commit.
- **Location:** `.github/workflows/check.yml` (concurrent `schedule` + `workflow_dispatch` triggers), `src/check-availability.ts:359` (`saveCache`)
- **Impact:** Two Telegram notifications are sent for the same slots. One of the two `git push` steps will fail with a non-fast-forward error (or silently win a race), leaving the cache in an indeterminate state.
- **Fix:** Add a concurrency group to the workflow to cancel or queue concurrent runs:
  ```yaml
  concurrency:
    group: acv-check
    cancel-in-progress: false   # queue, don't cancel — ensures cache is always saved
  ```

---

### README Documents 30 Days But Code Uses 14 Days

- **Severity:** MEDIUM
- **Description:** The README states "Komende 30 dagen" (upcoming 30 days) in the description and example output, but the code defines `LOOKAHEAD_DAYS = 14`.
- **Location:** `src/check-availability.ts:27` (code), `README.md:8` and example output (docs)
- **Impact:** Users who fork and configure based on the README expect to see 30 days of slots in notifications; they will see 14. This erodes trust and causes confusion when debugging.
- **Fix:** Either update the README to say "14 dagen", or make `LOOKAHEAD_DAYS` configurable via an env var (`LOOKAHEAD_DAYS=30`) and document it in the README.

---

## LOW Severity

---

### No Test Coverage

- **Severity:** LOW
- **Description:** The entire codebase is a single 367-line file with no test framework configured and no test files of any kind. Business-critical logic — `buildMessage`, `normalizeTime`, the cache diffing in `main()` — is entirely untested.
- **Location:** `src/check-availability.ts` (entire file); no `*.test.ts` or `*.spec.ts` files exist
- **Impact:** Regressions in notification logic (e.g., false positives, broken message format, incorrect slot diffing) go undetected until the script is run in production.
- **Fix:** Add `vitest` as a dev dependency (zero-config with `tsx`). Extract `buildMessage`, `normalizeTime`, `getUpcomingDateRange`, and the cache-diff logic into testable pure functions in a separate module (e.g., `src/utils.ts`). Write unit tests covering the cache diff (new date, new slot, no change) and message formatting edge cases.

---

### Mixed HTTP Clients (`fetch` vs `https.request`)

- **Severity:** LOW
- **Description:** ACV API calls use the global `fetch` API (modern, Promise-based). The Telegram call uses the low-level Node.js `https.request` (manual Promise wrapping, manual body accumulation, manual `Content-Length` calculation).
- **Location:** `src/check-availability.ts:2` (import), `src/check-availability.ts:216-252` (`sendTelegram`)
- **Impact:** The `https.request` implementation is ~35 lines for what `fetch` would do in ~10, introducing additional surface area for bugs (e.g., the missing JSON try/catch noted above). No runtime impact.
- **Fix:** Replace `sendTelegram`'s `https.request` with a `fetch` call:
  ```typescript
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" }),
  });
  const json = await res.json() as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram error: ${json.description}`);
  ```

---

### Manual `.env` Parser Instead of `dotenv`

- **Severity:** LOW
- **Description:** A custom regex-based `.env` parser is implemented inline (lines 5–12). It only handles `SCREAMING_SNAKE_CASE` keys (lowercase keys are silently ignored), strips only leading/trailing `"` or `'` quotes (not escaped quotes), and has no multiline value support.
- **Location:** `src/check-availability.ts:5-12`
- **Impact:** The parser will silently fail to load any `.env` key that contains lowercase letters. For the current set of variables (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TOWNSHIP`) this is not a live issue, but it is a fragile convention that can surprise future contributors.
- **Fix:** Add `dotenv` as a dev dependency (`npm i -D dotenv`) and replace the manual parser:
  ```typescript
  import { config } from "dotenv";
  if (existsSync(".env")) config();
  ```

---

### Hardcoded `PRODUCT`, `SITE`, and `LANGUAGE` Constants

- **Severity:** LOW
- **Description:** `PRODUCT = "2"`, `SITE = "1"`, and `LANGUAGE = "nl"` are hardcoded constants with no env-var override path.
- **Location:** `src/check-availability.ts:23-26`
- **Impact:** Anyone forking this script for a different ACV product type, site, or language must edit the source code. Not a practical problem for the current single-use case, but it limits reusability.
- **Fix:** Expose as optional env vars with existing values as defaults:
  ```typescript
  const PRODUCT = process.env.PRODUCT ?? "2";
  const SITE = process.env.SITE ?? "1";
  const LANGUAGE = process.env.LANGUAGE ?? "nl";
  ```

---

*Concerns audit: 2025-07-15*
