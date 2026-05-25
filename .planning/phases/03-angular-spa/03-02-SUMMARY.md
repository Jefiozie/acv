---
phase: 03-angular-spa
plan: "02"
subsystem: frontend
tags: [angular, signal-forms, vitest, tdd, accessibility, subscribe-form]
dependency_graph:
  requires:
    - frontend/src/app/app.config.ts (provideHttpClient)
    - frontend/src/app/app.routes.ts ('' route → SubscribeComponent)
  provides:
    - frontend/src/app/core/models/subscription.model.ts (Frequency, Township, SubscribeRequest, TOWNSHIPS)
    - frontend/src/app/core/services/subscription.service.ts (SubscriptionService)
    - frontend/src/app/subscribe/subscribe.component.ts (SubscribeComponent — full implementation)
    - frontend/src/app/subscribe/subscribe.component.html (subscribe form template)
    - frontend/src/app/subscribe/subscribe.component.scss (mobile-first SCSS)
  affects:
    - plan 03-04 (mock interceptor will intercept POST /api/subscribe)
tech_stack:
  added:
    - "@angular/forms/signals (experimental 21.0.0) — form(), FormField, email(), required()"
    - "takeUntilDestroyed (rxjs-interop) — subscription lifecycle management"
  patterns:
    - "Signal Forms: form(model, schemaFn) with required(path) and email(path) validators"
    - "FieldTree sub-field access: subscribeForm.email (FieldTree) vs subscribeForm.email() (FieldState)"
    - "Four-state UI machine: idle → loading → success | error via signal()"
    - "OnPush + zoneless: signals drive template re-evaluation, no explicit markForCheck()"
    - "deepSignal (internal) propagates child field value changes synchronously back to root model"
key_files:
  created:
    - frontend/src/app/core/models/subscription.model.ts
    - frontend/src/app/core/services/subscription.service.ts
    - frontend/src/app/subscribe/subscribe.component.html
    - frontend/src/app/subscribe/subscribe.component.scss
    - frontend/src/app/subscribe/subscribe.component.spec.ts
  modified:
    - frontend/src/app/subscribe/subscribe.component.ts (replaced stub with full implementation)
decisions:
  - "Signal Forms API: form(model, schemaFn) where email(path)/required(path) take SchemaPath, not standalone validators — plan description was inaccurate; actual API used from type definitions"
  - "Template binding: [formField]='emailField' where emailField = subscribeForm.email (FieldTree, not called); template reads emailField().invalid() to get FieldState signals"
  - "Event handling: Signal Forms listens to 'input' event (not 'change') for all native elements including <select> — tests must use fireEvent.input not fireEvent.change"
  - "No jest-dom matchers: @testing-library/jest-dom not installed; replaced toBeInTheDocument() with toBeTruthy() on getBy* results; replaced toHaveAttribute() with getAttribute() assertion"
  - "FormField directive: imported directly into component imports array (no SignalFormsModule exists)"
metrics:
  duration: "12 minutes"
  completed: "2026-05-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
---

# Phase 3 Plan 02: Subscribe Form with Signal Forms and Vitest Specs Summary

**One-liner:** Angular Signal Forms subscribe component (form/required/email validators) with 4-state machine, WCAG AA accessibility, mobile-first SCSS, and 9 passing Vitest specs.

## What Was Built

### Task 1: Shared Models and SubscriptionService

Created `frontend/src/app/core/models/subscription.model.ts` with:
- `Frequency = 'immediate' | 'daily'` union type
- `Township` interface (`id: string`, `name: string`)
- `SubscribeRequest` interface (`email`, `townshipId`, `frequency`)
- `TOWNSHIPS` constant: `[{ id: '16', name: 'Ede' }]` with TODO comment for expansion

Created `frontend/src/app/core/services/subscription.service.ts`:
- `@Injectable({ providedIn: 'root' })` 
- `subscribe(data: SubscribeRequest): Observable<void>` via `HttpClient.post('/api/subscribe', data)` (relative URL for CloudFront proxy)

### Task 2: SubscribeComponent (TDD — RED → GREEN)

Replaced the stub `SubscribeComponent` with a full standalone, OnPush Angular Signal Forms component.

**Component architecture:**
- Signal Form: `form(this.formModel, (p) => { required(p.email); email(p.email); required(p.townshipId); required(p.frequency); })`
- Field aliases: `emailField = subscribeForm.email`, etc. (FieldTree objects, not called)
- Template binding: `[formField]="emailField"` (FormField directive)
- State reads in template: `emailField().invalid()`, `emailField().touched()` (calling FieldTree returns FieldState, then calling signal)
- Submit guard: `if (!this.subscribeForm().valid()) return;`
- Subscription lifecycle: `takeUntilDestroyed(this.destroyRef)`

**Template structure:**
- `<form (submit)="onSubmit($event)">` — native DOM submit (not `(ngSubmit)`)
- Email field with `aria-required`, `aria-describedby="email-error"`, Dutch error paragraph
- Township `<select>` with `@for` loop over TOWNSHIPS constant
- Frequency `<fieldset>/<legend>` with two radio inputs
- Submit button: `[disabled]="subscribeForm().invalid() || state() === 'loading'"`
- Privacy routerLink: `<a routerLink="/privacy">Privacybeleid</a>`
- Success state: `<p role="status">Check je inbox...</p>`
- Error state: `<p role="alert">Er is iets misgegaan...</p>` (fixed Dutch string, no status codes)

**SCSS:**
- Mobile-first, full-width fields
- `font-size: 1rem` (≥16px, prevents iOS auto-zoom)
- `min-height: 44px` on inputs, selects, button, radio labels
- Error color `#c0392b` (4.6:1 contrast on white — WCAG AA)
- `max-width: 480px` centered layout at `min-width: 640px`

## Test Results

```
Test Files  4 passed (4)
Tests       19 passed (19)
  ✓ SubscribeComponent (9 tests)
    ✓ shows email error on blur with invalid email and does not call API
    ✓ shows township error on submit attempt with no township selected
    ✓ shows frequency error on submit attempt with no frequency selected
    ✓ calls SubscriptionService.subscribe with correct body on valid submit
    ✓ shows success state after subscribe observable completes
    ✓ shows Dutch error message when subscribe observable errors
    ✓ township dropdown contains an option with text "Ede"
    ✓ frequency radios include labels "Meteen" and "Dagelijks overzicht"
    ✓ renders a routerLink to /privacy in the template
```

**Status: ALL PASS** — `npm test` exits 0.

## Deviations from Plan

### Auto-adapted Issues

**1. [Rule 1 - API Deviation] Signal Forms `email()` and `required()` take a SchemaPath, not standalone validators**
- **Found during:** Task 2 implementation, reading `@angular/forms/types/signals.d.ts`
- **Issue:** Plan described: `import { form, FormField, validators email(), required() } from '@angular/forms/signals'` suggesting they are standalone validator factories. Actual API: `email(path, config?)` and `required(path, config?)` are called INSIDE the schema function with a `SchemaPath` argument.
- **Fix:** Used the schema-function pattern: `form(this.formModel, (p) => { required(p.email); email(p.email); required(p.townshipId); required(p.frequency); })`
- **Files modified:** `subscribe.component.ts`

**2. [Rule 1 - API Deviation] FieldTree field access requires property access (not method call) for template binding**
- **Found during:** Reading the type definitions and understanding FieldTree vs FieldState
- **Issue:** Plan says "Access fields via method call: `this.subscribeForm.email()`, NOT `.controls.email`". While `this.subscribeForm.email()` returns `FieldState<string>`, for template binding we need to pass the `FieldTree` itself (not called). The `[formField]` input expects a `Field<T>` (callable), which `FieldTree<T>` satisfies.
- **Fix:** `readonly emailField = this.subscribeForm.email` (without call). In template: `[formField]="emailField"`. For state checks: `emailField().invalid()` (calls FieldTree, returns FieldState, then calls Signal).
- **Files modified:** `subscribe.component.ts`, `subscribe.component.html`

**3. [Rule 1 - Bug] Signal Forms listens to `input` event for ALL native elements (including `<select>`)**
- **Found during:** Task 2 TDD, test failures for submit with township/frequency values
- **Issue:** Tests used `fireEvent.change(select, { target: { value: '16' } })`. Signal Forms only registers `listenToDom('input', ...)` — NOT a `change` listener. `fireEvent.change` was silently ignored.
- **Fix:** Updated spec to use `fireEvent.input(select)` after setting `.value`. Same for radio buttons: `radio.checked = true; fireEvent.input(radio)`.
- **Files modified:** `subscribe.component.spec.ts`

**4. [Rule 2 - Missing] `@testing-library/jest-dom` not installed; replaced matchers**
- **Found during:** Task 2 RED phase, first test run
- **Issue:** `toBeInTheDocument()` and `toHaveAttribute()` are jest-dom matchers — not available in bare Vitest without jest-dom setup. Package not installed in project.
- **Fix (auto, no install):** Replaced `toBeInTheDocument()` with `toBeTruthy()` (since `getBy*` queries throw if not found, finding the element IS the assertion). Replaced `toHaveAttribute('href', '/privacy')` with `expect(el.getAttribute('href')).toBe('/privacy')`.
- **Note:** No package install was required — standard Vitest assertions suffice for these behaviors.
- **Files modified:** `subscribe.component.spec.ts`

## Threat Model Compliance

- **T-03-02-01 (XSS):** All values rendered via `{{ }}` interpolation. Zero `[innerHTML]` bindings (confirmed by verification grep). ✅
- **T-03-02-02 (Information Disclosure):** Error state shows fixed Dutch string `Er is iets misgegaan...`. `HttpErrorResponse` is captured in the `.subscribe({ error: () => ... })` callback but never passed to template. ✅
- **T-03-02-03 (Client-side bypass):** Accepted — server-side validation in Phase 2 is the control. ✅
- **T-03-02-04 (CSRF):** Accepted — public endpoint, CORS handled in Phase 2. ✅

## Self-Check: PASSED

- [x] `frontend/src/app/core/models/subscription.model.ts` exists with TOWNSHIPS constant
- [x] `frontend/src/app/core/services/subscription.service.ts` exports SubscriptionService
- [x] `frontend/src/app/subscribe/subscribe.component.ts` — standalone, OnPush, Signal Forms
- [x] `frontend/src/app/subscribe/subscribe.component.html` — template with form/routerLink
- [x] `frontend/src/app/subscribe/subscribe.component.scss` — mobile-first styles
- [x] `frontend/src/app/subscribe/subscribe.component.spec.ts` — 9 behavior tests
- [x] Commit `4e488ef` (models + service) exists
- [x] Commit `d779790` (RED spec) exists
- [x] Commit `affb786` (GREEN implementation) exists
- [x] `npm test` exits 0 with 19 passing specs (4 test files)
- [x] TypeScript `--noEmit` exits 0
