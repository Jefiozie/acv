# Coding Conventions

**Analysis Date:** 2025-01-01

## Naming Patterns

**Constants (module-level config):**
- Use `SCREAMING_SNAKE_CASE` for all module-level constants.
- Examples: `RENTAL_PAGE_URL`, `TELEGRAM_TOKEN`, `LOOKAHEAD_DAYS`, `CACHE_FILE`

**Functions:**
- Use `camelCase` for all function names.
- Examples: `getSession`, `fetchCalendarMonth`, `formatDateNL`, `buildMessage`, `sendTelegram`, `loadCache`, `saveCache`, `main`

**Types and Interfaces:**
- Use `PascalCase` for all `type` aliases and `interface` definitions.
- Examples: `DayState`, `TimePart`, `CalendarDay`, `CalendarResponse`, `CacheEntry`, `Cache`, `SlotRow`

**Variables:**
- Use `camelCase` for all local variables and function parameters.
- Examples: `cookieString`, `upcomingAvailable`, `currentCache`, `previousCache`, `newOrUpdated`

## Code Style

**Formatting:**
- No linter or formatter is configured (no `.eslintrc`, `.prettierrc`, or `biome.json`).
- Match the style present in `src/check-availability.ts`: double quotes for strings, 2-space indentation.

**Strings:**
- Use double quotes `"` for all string literals.

**Section Separators:**
- Divide logically related code into named sections using the visual separator pattern:
  ```typescript
  // ─── Section Name ────────────────────────────────────────────────────────────
  ```
- Established sections in `src/check-availability.ts`: `Config`, `Types`, `Session`, `Calendar fetch`, `Helpers`, `Cache`, `Telegram`, `Message builder`, `Main`.
- Add new logical groups inside a matching section, or introduce a new section with the same separator style.

**Async/Await:**
- Use `async/await` for all asynchronous operations.
- Raw `Promise` constructor (`new Promise(...)`) is acceptable only when wrapping a callback-based Node.js API (e.g., `https.request` in `sendTelegram`).
- Do not use raw `.then()/.catch()` chains for application logic.

**Parallelism:**
- Use `Promise.all([...])` when multiple independent async calls can be made concurrently.
- Example from `main()`:
  ```typescript
  const [currentMonthDays, nextMonthDays] = await Promise.all([
    fetchCalendarMonth(thisYear, thisMonth, cookieString),
    fetchCalendarMonth(nextYear, nextMonth, cookieString),
  ]);
  ```

## Error Handling

**Non-fatal warnings:**
- Use `console.warn(...)` for recoverable conditions where execution continues.
- Examples: missing `PHPSESSID`, `SetProfileOption` not returning success, empty HTTP response, `valid=false` API response.

**Fatal errors:**
- Use `console.error(...)` for unrecoverable conditions.
- Throw or allow errors to propagate up to `main()`'s catch block, which calls `process.exit(1)`.

**Top-level entry point:**
```typescript
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**JSON parse safety:**
- Wrap `JSON.parse()` in a `try/catch` whenever parsing external HTTP responses.
- Return a safe fallback (e.g., `[]` or `{}`) from the catch block.

**Silent fallback for non-critical data:**
- Catch and silently swallow errors for non-critical reads (e.g., corrupt cache file), returning a safe default.

## TypeScript Practices

**Strict mode:**
- `tsconfig.json` enables `"strict": true`. All code must satisfy strict checks — no implicit `any`, no unchecked nulls.

**Target & module:**
- `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`.
- Use modern JS features freely (optional chaining, nullish coalescing, array spreading, `structuredClone`, etc.).

**Interface placement:**
- Define all `interface` and `type` declarations at the top of the file, inside the `// ─── Types ───` section, before any function definitions.

**Type assertions:**
- Use `as SomeType` for casting parsed JSON or typed-but-unknown values:
  ```typescript
  const data = JSON.parse(text) as CalendarResponse;
  const parsed = JSON.parse(data) as { ok: boolean; description?: string };
  ```
- Prefer narrowing / type guards over assertions wherever possible.

**Optional fields:**
- Model optional API fields with `?:` in interfaces:
  ```typescript
  interface CalendarDay {
    parts?: TimePart[];
  }
  ```
- Access optional fields with `?? []` or optional chaining:
  ```typescript
  const availSlots = (day.parts ?? []).filter(...);
  ```

**Return type annotations:**
- Annotate return types on all exported/top-level functions:
  ```typescript
  async function getSession(): Promise<string> { ... }
  function formatDateNL(dateStr: string): string { ... }
  ```

## Import Style

**Node built-ins:**
- Use named imports from Node built-in modules:
  ```typescript
  import { readFileSync, writeFileSync, existsSync } from "fs";
  import { request } from "https";
  ```
- Do not use default or namespace imports (`import fs from "fs"` or `import * as fs from "fs"`).

**Import ordering:**
- Built-in Node modules first, then (if ever added) third-party packages, then local modules.
- Currently the file has only built-in imports — maintain this order if dependencies are added.

## Environment Variable Pattern

- Read env vars at the top of the file, inside the `// ─── Config ───` section, using nullish coalescing to provide defaults:
  ```typescript
  const TOWNSHIP = process.env.TOWNSHIP ?? "16";
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
  ```
- Assign env vars to named constants immediately; never inline `process.env.*` calls deeper in the code.
- No `dotenv` package is used. A manual `.env` parser runs at the very top of the file when a `.env` file is present. This parser:
  - Only sets vars that are not already in `process.env` (CI secrets take precedence).
  - Strips surrounding quotes and whitespace from values.
  - Only matches `UPPER_SNAKE_CASE` keys.

## File and Module Organization

**Single-file structure:**
- All application code lives in `src/check-availability.ts`.
- Internal organization follows the section separator pattern (see above).
- Canonical section order: `.env` bootstrap → `Config` → `Types` → functional sections (Session, Calendar fetch, Helpers, Cache, Telegram, Message builder) → `Main`.

**Adding new code:**
- Add new constants to `// ─── Config ───`.
- Add new types/interfaces to `// ─── Types ───`.
- Add new pure helper functions to `// ─── Helpers ───` or a new dedicated section.
- Keep the `// ─── Main ───` section as the orchestration entry point only — move reusable logic to dedicated sections.
- If the file grows significantly, split into multiple modules under `src/` and import them into `src/check-availability.ts`.

---

*Convention analysis: 2025-01-01*
