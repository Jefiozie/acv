# Phase 3: Angular SPA — Validation Architecture

**Phase:** 03-angular-spa
**Nyquist validation:** enabled (`workflow.nyquist_validation: true`)
**Test framework:** Vitest + `@analogjs/vitest-angular`

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + `@analogjs/vitest-angular` |
| Config file | `frontend/vitest.config.ts` |
| Run command | `npm run test` (in `frontend/`) |
| Coverage command | `npm run test -- --coverage` |
| Environment | `jsdom` (via Vitest `environment: 'jsdom'`) |

---

## Requirement → Test Map

| Req ID | Behavior | Test Type | File | Automated Command |
|--------|----------|-----------|------|-------------------|
| FE-01 | Subscribe form renders with all inputs | Smoke | `subscribe.component.spec.ts` | `npm run test` |
| FE-02 | Email validation rejects invalid formats | Unit | `subscribe.component.spec.ts` | `npm run test` |
| FE-02 | Township required validation | Unit | `subscribe.component.spec.ts` | `npm run test` |
| FE-02 | Frequency required validation | Unit | `subscribe.component.spec.ts` | `npm run test` |
| FE-03 | Success state shown after valid submit | Unit | `subscribe.component.spec.ts` | `npm run test` |
| FE-04 | Confirm component reads `?token` query param | Unit | `confirm.component.spec.ts` | `npm run test` |
| FE-04 | Confirm component shows success state | Unit | `confirm.component.spec.ts` | `npm run test` |
| FE-04 | Confirm component shows error on bad token | Unit | `confirm.component.spec.ts` | `npm run test` |
| FE-05 | Unsubscribe component reads `?token` query param | Unit | `unsubscribe.component.spec.ts` | `npm run test` |
| FE-05 | Unsubscribe component shows success state | Unit | `unsubscribe.component.spec.ts` | `npm run test` |
| FE-06 | WCAG AA: aria-required on form inputs | Lint / axe | `subscribe.component.spec.ts` | `axe-cli` (03-04) |
| FE-07 | All components use `ChangeDetectionStrategy.OnPush` | Static | `tsc --noEmit` | `npm run test` |
| SUB-01 | POST /api/subscribe called with correct body | Unit | `subscribe.component.spec.ts` | `npm run test` |
| SUB-02 | Form disabled while loading | Unit | `subscribe.component.spec.ts` | `npm run test` |
| SUB-03 | Error state shown on HTTP error | Unit | `subscribe.component.spec.ts` | `npm run test` |
| UNSUB-02 | Unsubscribe page reachable at `/uitschrijven` | Route | `app.routes.spec.ts` | `npm run test` |
| COMP-01 | Angular pinned to `21.2.14` (no `^`/`~`) | Static | `package.json` check | `grep "@angular/core" frontend/package.json` |

---

## Wave 0 Gaps (stubs must exist before implementation begins)

These spec files must be created with failing stubs (RED) **before** implementation:

- [ ] `frontend/vitest.config.ts` — Vitest config with `@analogjs/vitest-angular` plugin
- [ ] `frontend/src/app/subscribe/subscribe.component.spec.ts` — 9 behaviors (FE-01–03, SUB-01–03): component creates, email validation, township validation, frequency validation, success state, error state, POST body, loading state, privacy link present
- [ ] `frontend/src/app/confirm/confirm.component.spec.ts` — 3 behaviors (FE-04): token read from input, success state, error state
- [ ] `frontend/src/app/unsubscribe/unsubscribe.component.spec.ts` — 3 behaviors (FE-05): token read from input, success state, error state

---

## Post-Deploy Spot Checks (03-04)

Manual verification after `ng build --configuration production`:

- [ ] `ng build --configuration production` exits with code 0 and produces `frontend/dist/`
- [ ] `npx tsc -p frontend/tsconfig.app.json --noEmit` exits with code 0
- [ ] `grep -r "useMockApi.*true" frontend/dist/` returns 0 matches (mock is off in production build)
- [ ] `axe-cli http://localhost:4200` (served from dist) reports 0 critical/serious violations on `/`, `/bevestigen`, `/uitschrijven`, `/privacy`
- [ ] Direct browser navigation to `/bevestigen?token=test` renders the confirm page (not a blank screen or 404)

---

## Coverage Thresholds

| Metric | Threshold |
|--------|-----------|
| Statements | ≥ 80% |
| Branches | ≥ 75% |
| Functions | ≥ 80% |

> Thresholds apply to `frontend/src/app/**` excluding `*.routes.ts` and `environments/`.
