# Technology Stack

**Analysis Date:** 2025-07-14

## Languages

**Primary:**
- TypeScript 5.8 — all source code in `src/`

## Runtime

**Environment:**
- Node.js 22 (inferred from `@types/node ^22.19.19`; native `fetch` API used, requires Node 18+)
- No `.nvmrc` or `.node-version` pinfile present

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- None — single-file script with no application framework

**Testing:**
- None — no test framework configured or installed

**Build/Dev:**
- `tsx ^4.19.0` — runs TypeScript directly via `node --import tsx`; no compile step required for development or production execution

## Key Dependencies

**Runtime execution:**
- `tsx ^4.19.0` — TypeScript executor (ESM-compatible, wraps esbuild under the hood); used as the sole runner via `npm run check`

**Type definitions:**
- `@types/node ^22.19.19` — Node.js built-in type declarations; covers `fs`, `https`, `Buffer`, `process`

**Compiler:**
- `typescript ^5.8.0` — compiler and language service; `strict: true` enforced

All three packages are `devDependencies`. There are no runtime (`dependencies`) entries — the script uses only Node.js built-ins and native `fetch`.

## Configuration

**TypeScript (`tsconfig.json`):**
- `target`: ES2022
- `module`: ESNext
- `moduleResolution`: bundler
- `strict`: true
- `esModuleInterop`: true
- `skipLibCheck`: true
- `lib`: ["ES2022"]
- `include`: `src/`

**Environment (`.env` file — existence noted, contents not read):**
- Parsed manually at startup in `src/check-availability.ts` (lines 5–12) using `fs.readFileSync`
- Variables: `TOWNSHIP`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- When `.env` is absent, vars must come from the process environment (e.g. CI secrets)

**npm scripts (`package.json`):**
```json
"check": "tsx src/check-availability.ts"
```
Run with: `npm run check`

## Platform Requirements

**Development:**
- Node.js ≥ 18 (native `fetch` required)
- `npm install` to install `tsx`, `typescript`, `@types/node`

**Production:**
- Node.js ≥ 18 on execution host
- `tsx` must be available (`npx tsx` or installed globally / as devDependency)
- Environment variables `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` must be set
- Write access to cwd for `availability_cache.json`

---

*Stack analysis: 2025-07-14*
