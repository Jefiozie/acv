# Codebase Structure

**Analysis Date:** 2025-05-25

## Directory Layout

```
acv-aanhanger/
├── src/
│   └── check-availability.ts   # Entire application — single source file
├── .planning/
│   └── codebase/               # GSD planning documents
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├── .agents/
│   └── skills/                 # Agent skill definitions (not project code)
├── availability_cache.json     # Runtime artifact — persisted availability snapshot
├── package.json                # Project metadata, scripts, devDependencies
├── package-lock.json           # Locked dependency tree
├── tsconfig.json               # TypeScript compiler options
├── skills-lock.json            # Agent skills lockfile
└── .env                        # Local secrets (gitignored) — TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TOWNSHIP
```

## Directory Purposes

**`src/`:**
- Purpose: All application source code
- Contains: TypeScript source files
- Key files: `src/check-availability.ts` — the only source file; contains config, types, all functions, and the `main()` entry point

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, and other analysis outputs
- Generated: Yes (by GSD mapper)
- Committed: Yes

**`.agents/skills/`:**
- Purpose: Reusable agent skill definitions for GSD tooling
- Contains: Angular-developer, angular-new-app, frontend-design skill packs
- Not application code — not referenced by the script at runtime

## Key File Locations

**Entry Point:**
- `src/check-availability.ts:363` — `main().catch(…)` — top-level invocation

**Configuration (compile-time constants):**
- `src/check-availability.ts:14–34` — URLs, PRODUCT, TOWNSHIP, SITE, LANGUAGE, LOOKAHEAD_DAYS, CACHE_FILE, credential env var names

**Types:**
- `src/check-availability.ts:36–70` — `DayState`, `TimePart`, `CalendarDay`, `CalendarResponse`, `CacheEntry`, `Cache`, `SlotRow`

**Session / HTTP scraping:**
- `src/check-availability.ts:72–126` — `getSession()`

**Calendar API fetch:**
- `src/check-availability.ts:128–170` — `fetchCalendarMonth()`

**Cache I/O:**
- `src/check-availability.ts:197–212` — `loadCache()`, `saveCache()`

**Telegram notification:**
- `src/check-availability.ts:214–288` — `sendTelegram()`, `buildMessage()`

**Orchestration:**
- `src/check-availability.ts:290–361` — `main()`

**Runtime Cache File:**
- `availability_cache.json` — written/read at project root during each run; do not delete between runs (losing it causes a spurious notification on next run)

**Secrets / Environment:**
- `.env` — local development only; not committed; keys: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TOWNSHIP` (optional, defaults to `"16"` = Ede)

**Build / Tool Config:**
- `tsconfig.json` — TypeScript settings (target ES2022, strict mode, no emit — tsx handles execution)
- `package.json` — defines `npm run check` as the sole script (`tsx src/check-availability.ts`)

## Naming Conventions

**Files:**
- Kebab-case: `check-availability.ts`
- New utility files should follow the same pattern: e.g. `src/format-message.ts`, `src/cache.ts`

**Functions:**
- camelCase verbs: `getSession`, `fetchCalendarMonth`, `loadCache`, `saveCache`, `sendTelegram`, `buildMessage`, `normalizeTime`, `formatDateNL`

**Types / Interfaces:**
- PascalCase: `CalendarDay`, `CacheEntry`, `SlotRow`, `TimePart`

**Type Aliases:**
- PascalCase union strings: `DayState`

**Constants:**
- SCREAMING_SNAKE_CASE: `RENTAL_PAGE_URL`, `LOOKAHEAD_DAYS`, `TELEGRAM_TOKEN`

## Where to Add New Code

**New notification channel (e.g. email, Slack):**
- Add a new `sendX(message: string): Promise<void>` function in `src/check-availability.ts` alongside `sendTelegram()`
- Or extract to a dedicated `src/notify.ts` file and import it

**New calendar source / second municipality:**
- Add a second `TOWNSHIP` constant or accept it as a CLI argument
- `fetchCalendarMonth()` already accepts `cookieString` — reuse it with a different session obtained for the new township

**Extracting modules (when file grows too large):**
- Types → `src/types.ts`
- Cache logic → `src/cache.ts`
- Telegram logic → `src/telegram.ts`
- Session + HTTP → `src/session.ts`
- `tsconfig.json` already includes all of `src/` — no config change needed

**Adding a new helper:**
- Place pure utility functions (`formatX`, `normalizeX`, `parseX`) in the `// ─── Helpers ───` section of `src/check-availability.ts` (line 172), or in a new `src/utils.ts` file

**Tests:**
- No test framework is currently configured
- To add tests: install `vitest`, create `src/check-availability.test.ts`, and add a `"test": "vitest"` script to `package.json`

## Runtime Artifacts

**`availability_cache.json`:**
- Created automatically on first successful run
- Must remain in project root (where the script is invoked from)
- Do not commit — add to `.gitignore` if not already present
- Deleting it causes the next run to treat all slots as "new" and send a Telegram notification

**`.env`:**
- Never committed
- Required for local runs; in CI/cron, inject secrets via environment variables directly

## Special Directories

**`node_modules/`:**
- Purpose: npm dependencies (`tsx`, `typescript`, `@types/node`)
- Generated: Yes (`npm install`)
- Committed: No

---

*Structure analysis: 2025-05-25*
