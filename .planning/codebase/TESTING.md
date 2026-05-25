# Testing Patterns

**Analysis Date:** 2025-01-01

## Current State

**No tests exist.** The project has:
- No test files anywhere in the repository.
- No test framework in `package.json` dependencies.
- No `test` script in `package.json`.
- No test configuration files (`jest.config.*`, `vitest.config.*`, etc.).

The entire application is a single CLI script: `src/check-availability.ts`. It mixes pure computation with side effects (HTTP requests, filesystem I/O, Telegram API calls).

---

## Recommended Testing Approach

### Framework Recommendation: Vitest

Use **Vitest** as the test runner. It requires zero additional configuration for TypeScript projects using `tsx`, integrates natively with ESM (`"module": "ESNext"`), and provides Jest-compatible APIs.

**Install:**
```bash
npm install --save-dev vitest
```

**Add scripts to `package.json`:**
```json
{
  "scripts": {
    "check": "tsx src/check-availability.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Add `vitest.config.ts`** (project root):
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

---

## Test File Organization

**Location:** Create a `src/__tests__/` directory for all test files.

**Naming:** Mirror the source filename with `.test.ts` suffix.

```
src/
├── check-availability.ts
└── __tests__/
    └── check-availability.test.ts
```

As the codebase grows and functions are extracted into separate modules, add a corresponding `*.test.ts` file for each module.

---

## Pure Functions — Testable Without Mocks

These functions in `src/check-availability.ts` are pure (no I/O, no side effects) and can be unit tested directly after being exported:

| Function | Location | What to test |
|----------|----------|--------------|
| `formatDateNL(dateStr)` | line 183 | Dutch locale date formatting for known dates |
| `normalizeTime(text)` | line 193 | `:00` stripping regex — edge cases and normal cases |
| `buildMessage(rows)` | line 263 | HTML message structure, `🆕` tagging, slot layout |
| `getUpcomingDateRange()` | line 174 | Returns `start` at midnight today, `end` 14 days ahead |

**To make these testable**, export them from the source file:
```typescript
export function formatDateNL(dateStr: string): string { ... }
export function normalizeTime(text: string): string { ... }
export function buildMessage(rows: SlotRow[]): string { ... }
export function getUpcomingDateRange(): { start: Date; end: Date } { ... }
```

Also export the types used in tests:
```typescript
export type { DayState, SlotRow, CacheEntry, Cache };
```

---

## Functions That Require Mocking

These functions perform I/O and must be tested with mocks or integration harnesses:

| Function | Side Effect | Mock Strategy |
|----------|-------------|---------------|
| `getSession()` | `fetch()` to ACV website | Mock global `fetch` |
| `fetchCalendarMonth()` | `fetch()` to ACV API | Mock global `fetch` |
| `sendTelegram()` | `https.request()` to Telegram API | Mock `node:https` module |
| `loadCache()` / `saveCache()` | `fs.readFileSync` / `fs.writeFileSync` | Mock `node:fs` module or use temp files |

---

## Test Structure

**Suite organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDateNL, normalizeTime, buildMessage, getUpcomingDateRange } from "../check-availability";

describe("formatDateNL", () => {
  it("formats a known date in Dutch locale", () => {
    // Use a fixed date to avoid locale flakiness
    const result = formatDateNL("2025-06-02");
    expect(result).toContain("maandag");
    expect(result).toContain("2");
    expect(result).toContain("juni");
  });
});

describe("normalizeTime", () => {
  it("strips trailing :00 from time ranges", () => {
    expect(normalizeTime("08:00:00 - 10:00:00")).toBe("08:00 - 10:00");
  });

  it("does not alter times without trailing :00", () => {
    expect(normalizeTime("08:00 - 10:00")).toBe("08:00 - 10:00");
  });
});

describe("buildMessage", () => {
  it("includes new-slot emoji for isNew rows", () => {
    const rows = [
      { date: "2025-06-02", state: "available" as const, slots: ["08:00 - 10:00"], isNew: true },
    ];
    const msg = buildMessage(rows);
    expect(msg).toContain("🆕");
    expect(msg).toContain("08:00 - 10:00");
  });

  it("omits new-slot emoji for previously seen rows", () => {
    const rows = [
      { date: "2025-06-02", state: "available" as const, slots: ["08:00 - 10:00"], isNew: false },
    ];
    const msg = buildMessage(rows);
    expect(msg).not.toContain("🆕");
  });

  it("includes count of new slots in header", () => {
    const rows = [
      { date: "2025-06-02", state: "available" as const, slots: [], isNew: true },
      { date: "2025-06-03", state: "semi" as const, slots: [], isNew: false },
    ];
    const msg = buildMessage(rows);
    expect(msg).toContain("1 nieuwe tijdslot");
  });
});
```

---

## Mocking Patterns

**Mocking `fetch` (for `getSession`, `fetchCalendarMonth`):**
```typescript
import { vi, describe, it, expect } from "vitest";

// At top of describe block:
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("returns empty string when PHPSESSID is missing", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    headers: { get: () => "" },        // no set-cookie header
  });
  const result = await getSession();
  expect(result).toBe("");
});
```

**Mocking the filesystem (for `loadCache`, `saveCache`):**
```typescript
import { vi } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

it("returns empty cache when file does not exist", () => {
  vi.mocked(fs.existsSync).mockReturnValue(false);
  const cache = loadCache();
  expect(cache).toEqual({});
});
```

**What to mock:**
- Global `fetch` for all HTTP interactions.
- `node:fs` methods (`existsSync`, `readFileSync`, `writeFileSync`) for cache tests.
- `node:https` `request` for `sendTelegram` tests.

**What NOT to mock:**
- Pure computation functions (`formatDateNL`, `normalizeTime`, `buildMessage`, `getUpcomingDateRange`).
- Date parsing and string manipulation logic.

---

## Cache Diff Logic — Integration Unit Test

The new-vs-previous comparison in `main()` is business-critical. Extract it into a testable function and cover it:

```typescript
// Suggested extracted function:
export function diffAvailability(
  current: Cache,
  previous: Cache
): string[] /* new/updated dates */ {
  return Object.keys(current).filter((date) => {
    const prev = previous[date];
    if (!prev) return true;
    const prevSlots = new Set(prev.slots);
    return current[date].slots.some((s) => !prevSlots.has(s));
  });
}
```

Test cases to cover:
- New date not in previous cache → included.
- Date in both caches, same slots → excluded.
- Date in both caches, one new slot added → included.
- Empty current cache → returns `[]`.

---

## Coverage

**Requirements:** None currently enforced.

**Recommended minimum targets once tests are added:**
- Pure functions: 100% branch coverage.
- Cache diff logic: 100% branch coverage.
- I/O functions: happy-path + one error-path each.

**View coverage:**
```bash
npm run test:coverage
```

---

## Test Types

**Unit tests (priority — add first):**
- Scope: individual exported pure functions.
- Location: `src/__tests__/check-availability.test.ts`.
- No network or filesystem access.

**Integration tests (add second):**
- Scope: `getSession`, `fetchCalendarMonth`, `sendTelegram` with mocked network.
- Location: `src/__tests__/check-availability.test.ts` (same file, separate `describe` blocks) or `src/__tests__/integration/`.

**E2E tests:**
- Not recommended for this project. The script's correctness is tightly coupled to the ACV website's HTML/API structure; live E2E tests would be brittle and rate-limited.

---

## Async Testing

```typescript
it("returns empty array on empty HTTP response", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    text: async () => "   ",
    headers: { get: () => "" },
  });
  const result = await fetchCalendarMonth(2025, 6, "PHPSESSID=abc");
  expect(result).toEqual([]);
});
```

## Error Path Testing

```typescript
it("returns empty array on malformed JSON", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    text: async () => "<html>not json</html>",
    headers: { get: () => "" },
  });
  const result = await fetchCalendarMonth(2025, 6, "PHPSESSID=abc");
  expect(result).toEqual([]);
});
```

---

*Testing analysis: 2025-01-01*
