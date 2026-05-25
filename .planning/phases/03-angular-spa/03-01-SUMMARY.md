---
phase: 03-angular-spa
plan: "01"
subsystem: frontend
tags: [angular, vitest, scaffold, routing, environments, interceptors]
dependency_graph:
  requires: []
  provides:
    - frontend/src/app/app.config.ts (provideRouter + withComponentInputBinding + conditional HttpClient)
    - frontend/vitest.config.ts (Vitest with @analogjs/vite-plugin-angular, jsdom, zoneless)
    - frontend/src/environments/environment.ts (production env: useMockApi false)
    - frontend/src/environments/environment.development.ts (dev env: useMockApi true)
    - frontend/src/app/interceptors/mock-api.interceptor.ts (HttpInterceptorFn skeleton)
    - frontend/src/app/app.routes.ts (4 lazy routes + wildcard)
  affects:
    - plans 03-02, 03-03 (replace stub components)
    - plan 03-04 (build verification + mock responses)
tech_stack:
  added:
    - "@angular/core 21.2.14 (exact pin)"
    - "@angular/build 21.2.12 (exact pin)"
    - "@analogjs/vite-plugin-angular 2.5.2 (Angular template compilation in Vitest)"
    - "@analogjs/vitest-angular 2.5.2 (zoneless TestBed setup)"
    - "vitest ^4.0.8 (test runner)"
    - "@testing-library/angular ^17.3.7"
    - "@vitest/coverage-v8 ^4.0.8"
  patterns:
    - "bootstrapApplication (standalone, no NgModules)"
    - "ChangeDetectionStrategy.OnPush everywhere"
    - "lazy-loaded routes via loadComponent"
    - "conditional HttpInterceptorFn registration (useMockApi gate)"
    - "withComponentInputBinding() for query-param-as-Input"
key_files:
  created:
    - frontend/ (Angular 21.2.12 project)
    - frontend/vitest.config.ts
    - frontend/src/test-setup.ts
    - frontend/src/environments/environment.ts
    - frontend/src/environments/environment.development.ts
    - frontend/src/app/interceptors/mock-api.interceptor.ts
    - frontend/src/app/subscribe/subscribe.component.ts (stub)
    - frontend/src/app/confirm/confirm.component.ts (stub)
    - frontend/src/app/unsubscribe/unsubscribe.component.ts (stub)
    - frontend/src/app/privacy/privacy.component.ts (stub)
  modified:
    - frontend/package.json (pinned versions, vitest run script)
    - frontend/angular.json (fileReplacements for dev config)
    - frontend/tsconfig.spec.json (test-setup.ts, vitest/globals types)
    - frontend/src/app/app.ts (AppComponent, OnPush, RouterLink)
    - frontend/src/app/app.html (header/nav/main/footer router shell)
    - frontend/src/app/app.config.ts (withComponentInputBinding, conditional HttpClient)
    - frontend/src/app/app.routes.ts (4 lazy routes + wildcard)
    - frontend/src/app/app.spec.ts (Vitest-compatible, provideRouter([]))
    - frontend/src/main.ts (import AppComponent)
decisions:
  - "Kept Angular 21.2.12 default file convention (app.ts, not app.component.ts) — renamed class to AppComponent"
  - "Used @analogjs/vite-plugin-angular for vitest.config.ts (correct package) not @analogjs/vitest-angular which lacks Vite plugin export"
  - "Adapted vitest setup for zoneless Angular 21 — no zone.js/testing setupFiles"
  - "Stub placeholder components created inline rather than inline in routes — cleaner and easier to replace in 03-02/03-03"
metrics:
  duration: "9 minutes"
  completed: "2026-05-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 29
  files_modified: 9
---

# Phase 3 Plan 01: Angular Scaffold with Vitest and Route Shell Summary

**One-liner:** Angular 21.2.14 standalone SPA scaffold with @analogjs/vite-plugin-angular Vitest, conditional mock interceptor, and 4 lazy-loaded route stubs.

## What Was Built

Generated an Angular 21.2.12 project in `frontend/` and wired it as the SPA foundation for the ACV Aanhanger subscription app:

1. **Angular scaffold** — `npx @angular/cli@21.2.12 new` with `--standalone --routing --style=scss --ssr=false`
2. **Exact version pinning** — all `@angular/*` packages pinned to exact `21.2.14` (no `^` or `~`)
3. **Vitest integration** — replaced `ng test` with `vitest run` using `@analogjs/vite-plugin-angular` for Angular template compilation
4. **Environments** — `environment.ts` (`useMockApi: false`) and `environment.development.ts` (`useMockApi: true`) with `fileReplacements` in `angular.json`
5. **Mock interceptor** — `HttpInterceptorFn` skeleton; conditionally registered in `provideHttpClient` only when `useMockApi: true`
6. **App config** — `provideRouter(routes, withComponentInputBinding())` for query-param-as-Input support
7. **Route map** — 4 lazy routes: `''` → Subscribe, `bevestigen` → Confirm, `uitschrijven` → Unsubscribe, `privacy` → Privacy, plus `**` wildcard
8. **AppComponent shell** — `ChangeDetectionStrategy.OnPush`, `RouterOutlet + RouterLink`, header/main/footer template
9. **Stub components** — placeholder components for all 4 routes (replaced in plans 03-02 and 03-03)

## Vitest Test Result

```
✓ src/app/app.spec.ts (1 test) 50ms
  ✓ AppComponent (1)
    ✓ should create the app 49ms

Test Files  1 passed (1)
Tests       1 passed (1)
```

**Status: PASS** — `npm test` (vitest run) exits 0.

## Key Files Created / Modified

| File | Status | Purpose |
|------|--------|---------|
| `frontend/vitest.config.ts` | Created | Vitest with @analogjs/vite-plugin-angular, jsdom, zoneless |
| `frontend/src/test-setup.ts` | Created | Zoneless TestBed setup for Angular 21 |
| `frontend/src/environments/environment.ts` | Created | Production: useMockApi: false |
| `frontend/src/environments/environment.development.ts` | Created | Dev: useMockApi: true |
| `frontend/src/app/interceptors/mock-api.interceptor.ts` | Created | HttpInterceptorFn skeleton |
| `frontend/src/app/app.config.ts` | Modified | withComponentInputBinding + conditional HttpClient |
| `frontend/src/app/app.routes.ts` | Modified | 4 lazy routes + wildcard |
| `frontend/src/app/app.ts` | Modified | AppComponent, OnPush, RouterLink |
| `frontend/src/app/app.html` | Modified | Router shell template |
| `frontend/package.json` | Modified | Pinned versions + vitest run script |
| `frontend/angular.json` | Modified | fileReplacements dev config |

## Deviations from Plan

### Auto-adapted Issues

**1. [Angular 21.2.12 Convention] File naming — `app.ts` not `app.component.ts`**
- **Found during:** Scaffold generation
- **Issue:** Angular 21.2.12 CLI uses shorter naming (`app.ts`, `App` class) vs the plan's expected `app.component.ts`/`AppComponent`
- **Fix:** Kept Angular 21 file convention (`app.ts`), renamed class from `App` → `AppComponent` to satisfy plan requirements
- **Files modified:** `frontend/src/app/app.ts`, `frontend/src/main.ts`, `frontend/src/app/app.spec.ts`

**2. [Angular 21.2.12 Convention] Zoneless — no zone.js**
- **Found during:** Scaffold generation
- **Issue:** Angular 21.2.12 generates zoneless projects; no zone.js installed
- **Fix:** `vitest.config.ts` uses `setupFiles: ['src/test-setup.ts']` with zoneless `setupTestBed({ zoneless: true })` instead of `zone.js/testing`
- **Files modified:** `frontend/vitest.config.ts`, `frontend/src/test-setup.ts`

**3. [Package API] `@analogjs/vitest-angular` doesn't export Angular Vite plugin**
- **Found during:** Creating vitest.config.ts
- **Issue:** Plan said `import { angular } from '@analogjs/vitest-angular'` but that package only exports `vitestBuilder`/`vitestApplicationBuilder`. The plugin is in `@analogjs/vite-plugin-angular` (a dependency)
- **Fix:** Imported `angular` from `@analogjs/vite-plugin-angular` in vitest.config.ts
- **Files modified:** `frontend/vitest.config.ts`

**4. [Angular 21.2.12] `@angular/build` replaces `@angular-devkit/build-angular`**
- **Found during:** Package inspection
- **Issue:** Plan specified pinning `@angular-devkit/build-angular` to `21.2.12`, but Angular 21.2.12 uses `@angular/build`
- **Fix:** Pinned `@angular/build: "21.2.12"` instead (the new equivalent package)
- **Files modified:** `frontend/package.json`

## Threat Model Compliance

- **T-03-01-01:** `useMockApi: false` confirmed in `environment.ts` (production). ✅
- **T-03-01-02:** Dev env only has `useMockApi: true` and empty `apiUrl`; no secrets. ✅  
- **T-03-01-SC:** All packages installed from npm registry; `@analogjs/vitest-angular` and `@analogjs/vite-plugin-angular` are from the AnalogJS project (analogjs.org), well-known in the Angular ecosystem. ✅

## Self-Check: PASSED

- [x] `frontend/vitest.config.ts` exists
- [x] `frontend/src/environments/environment.ts` exists
- [x] `frontend/src/environments/environment.development.ts` exists
- [x] `frontend/src/app/app.config.ts` has `withComponentInputBinding`
- [x] `frontend/src/app/app.routes.ts` has 4 routes + wildcard
- [x] `frontend/src/app/interceptors/mock-api.interceptor.ts` exists
- [x] Commit `0f12690` exists
- [x] `npm test` exits 0 with 1 passing spec
