# Phase 3: Angular SPA — Research

**Researched:** 2025-06-13
**Domain:** Angular 21+ SPA (Signal Forms, httpResource, standalone components, accessibility)
**Confidence:** HIGH (all claims verified against npm registry type definitions and Angular changelog)

---

## Summary

Phase 3 builds the public-facing Angular SPA: a subscription form, confirmation/unsubscribed/privacy pages, and full API integration against the Phase 2 backend. The app is standalone-only (no NgModules), uses signals-based reactivity, and must meet WCAG AA accessibility and mobile-first responsive requirements.

**Critical finding: Signal Forms and `httpResource` are still `@experimental` in v21.2.14.** The prior STACK.md research described them as "stable in v21" — this is incorrect per the actual published type definitions. Both APIs carry a risk of minor-version breaking changes. Angular's changelog explicitly notes breaking changes as "Breaking Changes (affecting only experimental features)". The planner must decide whether to use them with eyes open to this risk, or fall back to stable alternatives for lower-risk components.

**Township list source of truth:** The backend architecture defines no `GET /townships` endpoint. The township list must be hardcoded as a TypeScript constant in the Angular app. ACV Groep serves a small number of fixed Dutch municipalities (~5–20). This avoids a network roundtrip for static data.

**Primary recommendation:** Use Signal Forms and `httpResource` as specified (per locked stack decisions), but document the experimental status explicitly in code and add the stable fallback pattern to each task for safety. Use `withComponentInputBinding()` (stable `@publicApi`) for reading query params as component inputs — this is the modern Angular 21 pattern for `?token=X` parameters.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | User can submit subscribe form with email and township selection | Signal Forms `form()` + `submit()`; HttpClient POST /subscribe |
| SUB-02 | Township picker lists all supported ACV Groep locations by name | Hardcoded `TOWNSHIPS` constant (no GET /townships endpoint defined in arch); `<select>` with `@for` |
| SUB-03 | User chooses notification frequency: "Immediately" or "Daily digest" | Radio group with Signal Forms `required()` validator |
| UNSUB-02 | Unsubscribe link resolves to a confirmation page in the Angular app | `/unsubscribe?token=X` route; `withComponentInputBinding()` to bind token as `@Input` |
| FE-01 | Angular 21+ SPA — standalone components, signals, `@if`/`@for`, no NgModules | `ng new --standalone`; `bootstrapApplication()`; `ChangeDetectionStrategy.OnPush` everywhere |
| FE-02 | Subscribe form validates email format and requires township + frequency before submit | Signal Forms `email()` + `required()` validators from `@angular/forms/signals` |
| FE-03 | Form shows success state after submission ("Controleer je e-mail") | Signal state machine in component: `idle → submitting → success | error` |
| FE-04 | Confirmation page shown when user clicks confirmation link from email | `/confirm?token=X` route; `input()` for token; calls `GET /confirm?token=X` via HttpClient |
| FE-05 | Unsubscribed page shown after unsubscribe link is followed | `/unsubscribe?token=X` route; calls `GET /unsubscribe?token=X`; shows success/already-unsubscribed state |
| FE-06 | App is accessible (WCAG AA): keyboard navigable, ARIA labels on form controls | `<label for>` + `id`; `aria-describedby` for errors; `role="alert"` on live error regions; focus management |
| FE-07 | App is responsive (mobile-first) | CSS with `min-width: 375px` breakpoints; fluid grid; `<meta name="viewport">` |
| COMP-01 | Privacy policy page linked from the subscription form | `/privacy` static route; `<a routerLink="/privacy">` on subscribe form |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Subscribe form (email + township + frequency) | Browser / Client | — | Pure client-side form with validation; submission calls API |
| Township list | Browser / Client | — | Hardcoded constant (no API endpoint); static data |
| Form validation (email format, required fields) | Browser / Client | API / Backend (server-side re-validates) | Client-side Signal Forms validators for UX; backend re-validates for correctness |
| POST /subscribe call | Browser → API | — | HttpClient calls backend Lambda via API Gateway |
| Confirmation page `/confirm?token=X` | Browser / Client | API / Backend | Component reads query param; calls `GET /confirm` on backend |
| Unsubscribe page `/unsubscribe?token=X` | Browser / Client | API / Backend | Same pattern: read token, call `GET /unsubscribe` |
| Privacy policy | Browser / Client | — | Static Dutch HTML content; no data fetching |
| Client-side routing | Browser / Client (Angular Router) | — | `provideRouter()` with lazy-loaded route components |
| HTTP error handling | Browser / Client | — | Global `HttpInterceptorFn` for error classification |
| Mock API (local dev when Phase 2 not deployed) | Browser / Client | — | Conditional `HttpInterceptorFn` returning mock responses |
| WCAG AA accessibility | Browser / Client | — | ARIA attributes, focus management, live regions in Angular templates |
| Responsive layout | Browser / Client | — | CSS media queries, mobile-first |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@angular/core` | 21.2.14 | Framework core, signals, DI | Latest stable LTS; signals fully stable; standalone default | 
| `@angular/cli` | 21.2.12 | Tooling, `ng new`, `ng build`, `ng serve` | Vite-based builder; esbuild prod; HMR in dev |
| `@angular/router` | 21.2.14 | Client-side routing | `provideRouter()` + `loadComponent` lazy routes; `withComponentInputBinding()` |
| `@angular/forms` | 21.2.14 | Signal Forms (`@angular/forms/signals`) | Only forms package for Angular 21; Signal Forms is the new direction |
| `@angular/common` | 21.2.14 | `httpResource`, `AsyncPipe`, `NgClass` | Core Angular library; `httpResource` for GET township list |
| `@angular/platform-browser` | 21.2.14 | DOM bootstrapping | `bootstrapApplication()` — no AppModule |

**Version verification:**
```bash
npm view @angular/core version   # 21.2.14 [VERIFIED: npm registry]
npm view @angular/forms version  # 21.2.14 [VERIFIED: npm registry]
npm view @angular/cli version    # 21.2.12 [VERIFIED: npm registry]
npm view @angular/router version # 21.2.14 [VERIFIED: npm registry]
```

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@angular/cdk` | 21.2.12 | `LiveAnnouncer` for WCAG AA error announcements | WCAG AA requirement: screen reader announcements on form errors |
| `@angular-devkit/build-angular` | 21.2.12 | Build tooling (transitive dep of CLI) | Included via CLI; no direct install needed |
| `typescript` | ~5.7.x | Type safety | Peer dep of Angular 21 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Signal Forms (`@angular/forms/signals`) | `ReactiveFormsModule` | Reactive forms are stable `@publicApi` — lower risk but "legacy path" per Angular team; Signal Forms is the Angular future |
| `httpResource` for GET townships | `HttpClient.get()` + `toSignal()` | `HttpClient.get()` is fully stable; `toSignal` is also stable (`@publicApi 20.0`). Use if `httpResource` experimental status is unacceptable |
| `withComponentInputBinding()` query params | `inject(ActivatedRoute).snapshot.queryParams` | Both patterns work; `withComponentInputBinding()` is cleaner and `@publicApi` stable |

**Installation (fresh project):**
```bash
cd frontend/
ng new acv-frontend --standalone --style=css --routing=true --skip-git
ng add @angular/cdk
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. All Angular packages are part of the official
> `@angular` monorepo (github.com/angular/angular), verified via `npm view <pkg> repository`.
> Manual verification: all packages are from `git+https://github.com/angular/angular.git` with
> 10+ year publication history and 50M+/week downloads.

| Package | Registry | Org | Source Repo | Slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `@angular/core` | npm | angular | github.com/angular/angular | N/A (manual verified) | Approved |
| `@angular/forms` | npm | angular | github.com/angular/angular | N/A (manual verified) | Approved |
| `@angular/common` | npm | angular | github.com/angular/angular | N/A (manual verified) | Approved |
| `@angular/router` | npm | angular | github.com/angular/angular | N/A (manual verified) | Approved |
| `@angular/cli` | npm | angular | github.com/angular/angular-cli | N/A (manual verified) | Approved |
| `@angular/cdk` | npm | angular | github.com/angular/components | N/A (manual verified) | Approved |
| `@angular/platform-browser` | npm | angular | github.com/angular/angular | N/A (manual verified) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck unavailable — all packages manually verified via official Angular GitHub repos and npm ownership.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (User)
    │
    ├─ / (subscribe form)
    │       Signal Forms model signal
    │       → form() + validators
    │       → [formField] directive on inputs
    │       → submit() → HttpClient.post('/api/subscribe')
    │                            │
    │                            ▼
    │                     API Gateway HTTP API (Phase 2)
    │                     POST /subscribe → Lambda
    │
    ├─ /confirm?token=X
    │       withComponentInputBinding() → @Input() token
    │       → HttpClient.get('/api/confirm?token=X')
    │       → success | error state signal
    │
    ├─ /unsubscribe?token=X
    │       withComponentInputBinding() → @Input() token
    │       → HttpClient.get('/api/unsubscribe?token=X')
    │       → success | already-unsubscribed state
    │
    └─ /privacy
            Static Dutch HTML (no HTTP calls)

Angular Bootstrap (main.ts)
    bootstrapApplication(AppComponent, appConfig)
        provideRouter(routes, withComponentInputBinding())
        provideHttpClient(withInterceptors([mockInterceptorFn]))  ← dev only
        provideHttpClient()  ← prod

AppComponent
    <router-outlet>

Lazy-loaded routes via loadComponent()
    /              → SubscribeFormComponent
    /confirm       → ConfirmComponent
    /unsubscribe   → UnsubscribeComponent
    /privacy       → PrivacyComponent
```

### Recommended Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.component.ts         # Root component with <router-outlet>
│   │   ├── app.config.ts            # provideRouter + provideHttpClient
│   │   ├── app.routes.ts            # Route definitions (lazy loadComponent)
│   │   ├── subscribe/
│   │   │   └── subscribe.component.ts  # Signal Forms subscribe form
│   │   ├── confirm/
│   │   │   └── confirm.component.ts    # /confirm?token=X page
│   │   ├── unsubscribe/
│   │   │   └── unsubscribe.component.ts # /unsubscribe?token=X page
│   │   ├── privacy/
│   │   │   └── privacy.component.ts    # Dutch privacy policy
│   │   ├── core/
│   │   │   ├── models/
│   │   │   │   └── subscription.model.ts  # TypeScript interfaces
│   │   │   ├── services/
│   │   │   │   └── subscription.service.ts # HttpClient wrapper
│   │   │   └── interceptors/
│   │   │       ├── error.interceptor.ts    # Global HTTP error handling
│   │   │       └── mock-api.interceptor.ts # Dev-only mock responses
│   │   └── shared/
│   │       └── townships.ts             # Hardcoded TOWNSHIPS constant
│   ├── environments/
│   │   ├── environment.ts              # { apiUrl: 'http://localhost:3000', useMockApi: true }
│   │   └── environment.prod.ts         # { apiUrl: 'https://api.acv-aanhanger.nl', useMockApi: false }
│   ├── index.html
│   ├── main.ts
│   └── styles.css
├── angular.json
└── tsconfig.json
```

### Pattern 1: App Bootstrap (no NgModules)

**What:** Functional bootstrap with `provideRouter` and `provideHttpClient`
**When to use:** Always — mandatory for this project

```typescript
// Source: @angular/core types - @publicApi; @angular/router types - @publicApi
// src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { environment } from '../environments/environment';
import { mockApiInterceptor } from './core/interceptors/mock-api.interceptor';

const httpFeatures = environment.useMockApi
  ? [withInterceptors([mockApiInterceptor, errorInterceptor])]
  : [withInterceptors([errorInterceptor])];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),  // enables query param → @Input binding
    provideHttpClient(...httpFeatures),
  ],
};
```

### Pattern 2: Lazy-Loaded Standalone Routes

**What:** `loadComponent` for code splitting; each page is a separate JS chunk
**When to use:** All routes — mandatory for production bundle optimization

```typescript
// Source: @angular/router Route interface - @publicApi [VERIFIED: npm registry types]
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./subscribe/subscribe.component')
      .then(m => m.SubscribeFormComponent),
  },
  {
    path: 'confirm',
    loadComponent: () => import('./confirm/confirm.component')
      .then(m => m.ConfirmComponent),
    title: 'Aanmelding bevestigd',
  },
  {
    path: 'unsubscribe',
    loadComponent: () => import('./unsubscribe/unsubscribe.component')
      .then(m => m.UnsubscribeComponent),
    title: 'Afgemeld',
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy.component')
      .then(m => m.PrivacyComponent),
    title: 'Privacybeleid',
  },
  { path: '**', redirectTo: '' },
];
```

### Pattern 3: Signal Forms Subscribe Form

> ⚠️ **Signal Forms is `@experimental 21.0.0`** — verified in `@angular/forms@21.2.14` type definitions.
> Angular changelog lists breaking changes "affecting only experimental features" between minor releases.
> Risk accepted per locked stack decisions. Fallback: `ReactiveFormsModule` (stable `@publicApi`).

```typescript
// Source: @angular/forms/signals types - @experimental 21.0.0 [VERIFIED: npm registry types]
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { form, FormField, submit, email, required } from '@angular/forms/signals';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TOWNSHIPS } from '../shared/townships';
import { environment } from '../../environments/environment';

interface SubscribeModel {
  email: string;
  townshipId: string;
  frequency: 'immediate' | 'daily';
}

@Component({
  selector: 'app-subscribe-form',
  standalone: true,
  imports: [FormField, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (submit)="onSubmit($event)">
      @if (state() === 'success') {
        <p role="status">Controleer je e-mail om je aanmelding te bevestigen.</p>
      } @else {
        <!-- Email field -->
        <label for="email">E-mailadres</label>
        <input
          id="email"
          type="email"
          [formField]="subscribeForm.email()"
          aria-required="true"
          [attr.aria-describedby]="subscribeForm.email().errors().length ? 'email-error' : null"
        />
        @if (subscribeForm.email().errors().length > 0 && subscribeForm.email().touched()) {
          <p id="email-error" role="alert">{{ subscribeForm.email().errors()[0].message }}</p>
        }

        <!-- Township picker -->
        <label for="township">Gemeente</label>
        <select
          id="township"
          [formField]="subscribeForm.townshipId()"
          aria-required="true"
        >
          <option value="">Kies een gemeente…</option>
          @for (t of townships; track t.id) {
            <option [value]="t.id">{{ t.name }}</option>
          }
        </select>

        <!-- Frequency radio group -->
        <fieldset>
          <legend>Hoe vaak wil je een melding?</legend>
          <label>
            <input type="radio" [formField]="subscribeForm.frequency()" value="immediate" />
            Meteen
          </label>
          <label>
            <input type="radio" [formField]="subscribeForm.frequency()" value="daily" />
            Dagelijks overzicht
          </label>
        </fieldset>

        @if (state() === 'error') {
          <p role="alert">Er is iets misgegaan. Probeer het opnieuw.</p>
        }

        <button type="submit" [disabled]="state() === 'submitting'">
          Aanmelden
        </button>

        <p>
          Door je aan te melden ga je akkoord met ons
          <a routerLink="/privacy">privacybeleid</a>.
        </p>
      }
    </form>
  `,
})
export class SubscribeFormComponent {
  private http = inject(HttpClient);
  readonly townships = TOWNSHIPS;

  readonly model = signal<SubscribeModel>({
    email: '',
    townshipId: '',
    frequency: 'immediate',
  });

  readonly subscribeForm = form(this.model, (path) => {
    required(path.email, { message: 'E-mailadres is verplicht' });
    email(path.email, { message: 'Voer een geldig e-mailadres in' });
    required(path.townshipId, { message: 'Kies een gemeente' });
    required(path.frequency);
  });

  readonly state = signal<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.subscribeForm, {
      action: async () => {
        this.state.set('submitting');
        try {
          await this.http.post(`${environment.apiUrl}/subscribe`, this.model()).toPromise();
          this.state.set('success');
        } catch {
          this.state.set('error');
          throw new Error('API call failed'); // returns false from submit()
        }
      },
    });
  }
}
```

### Pattern 4: Query Params via `withComponentInputBinding()`

**What:** Router binds `?token=X` query param directly to `@Input() token` (or `input<string>()`)
**When to use:** `/confirm?token=X` and `/unsubscribe?token=X` pages

```typescript
// Source: @angular/router withComponentInputBinding - @publicApi [VERIFIED: npm registry types]
// src/app/confirm/confirm.component.ts
import { Component, OnInit, input, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'loading') {
      <p>Aanmelding bevestigen…</p>
    } @else if (state() === 'success') {
      <h1>Aanmelding bevestigd</h1>
      <p>Je ontvangt een melding zodra er een beschikbare trailer is.</p>
    } @else if (state() === 'error') {
      <h1>Oeps</h1>
      <p>De bevestigingslink is ongeldig of verlopen.</p>
    }
  `,
})
export class ConfirmComponent implements OnInit {
  // withComponentInputBinding() makes ?token=X available as input() [VERIFIED: @publicApi]
  readonly token = input<string>('');
  private http = inject(HttpClient);
  readonly state = signal<'loading' | 'success' | 'error'>('loading');

  ngOnInit(): void {
    if (!this.token()) {
      this.state.set('error');
      return;
    }
    this.http.get(`${environment.apiUrl}/confirm`, {
      params: { token: this.token() }
    }).subscribe({
      next: () => this.state.set('success'),
      error: () => this.state.set('error'),
    });
  }
}
```

### Pattern 5: Mock API Interceptor for Local Dev

**What:** `HttpInterceptorFn` that short-circuits HTTP calls and returns mock data when Phase 2 isn't deployed
**When to use:** `environment.ts` with `useMockApi: true` (local dev only)

```typescript
// Source: @angular/common/http HttpInterceptorFn - @publicApi [VERIFIED: npm registry types]
// src/app/core/interceptors/mock-api.interceptor.ts
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  // POST /subscribe
  if (req.method === 'POST' && req.url.includes('/subscribe')) {
    return of(new HttpResponse({ status: 202, body: null })).pipe(delay(500));
  }
  // GET /confirm
  if (req.method === 'GET' && req.url.includes('/confirm')) {
    const token = req.params.get('token');
    return token === 'invalid'
      ? throwError(() => new Error('Invalid token')).pipe(delay(300))
      : of(new HttpResponse({ status: 200, body: null })).pipe(delay(300));
  }
  // GET /unsubscribe
  if (req.method === 'GET' && req.url.includes('/unsubscribe')) {
    return of(new HttpResponse({ status: 200, body: null })).pipe(delay(300));
  }
  return next(req);
};
```

### Pattern 6: Hardcoded Township List

**What:** TypeScript constant for ACV Groep municipalities; no API call needed
**Why hardcoded:** No `GET /townships` endpoint defined in architecture; list is small and stable

```typescript
// Source: Existing src/check-availability.ts (township ID "16" = Ede) [VERIFIED: codebase]
// src/app/shared/townships.ts
export interface Township {
  id: string;
  name: string;
}

// ACV Groep trailer locations - Dutch municipalities
// ⚠️ [ASSUMED] - Full list of ACV Groep locations not verified; must be confirmed with user
// Known: "16" = Ede (from existing codebase)
export const TOWNSHIPS: Township[] = [
  { id: '16', name: 'Ede' },
  // Additional locations must be verified against ACV Groep website
  // See: https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen
];
```

### Pattern 7: Global HTTP Error Interceptor

```typescript
// src/app/core/interceptors/error.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Log non-4xx errors (4xx are expected: duplicate subscription, invalid token)
      if (error.status >= 500 || error.status === 0) {
        console.error('[HTTP Error]', error.status, req.url, error.message);
      }
      return throwError(() => error);
    }),
  );
```

### Anti-Patterns to Avoid

- **Using `NgModule` imports**: `imports: [BrowserModule, FormsModule]` — never. Standalone components import only what they use.
- **`*ngIf` / `*ngFor`**: Use `@if` / `@for` (new control flow). The old structural directives still work but contradict the FE-01 requirement.
- **`effect()` for HTTP calls**: Causes infinite loops if the signal written inside the effect is read by the same effect. Use `resource()` or `rxResource()` for reactive async.
- **Putting `HttpClient` directly in components**: For mutations (POST /subscribe), inject `HttpClient` in `SubscriptionService`. For the form component specifically, inject it directly or via service — both are acceptable for a small app.
- **Not using `ChangeDetectionStrategy.OnPush`**: Required by architecture. With signals, Angular 21 only updates when signals change — OnPush is critical for performance.
- **`httpResource` for POST**: `httpResource` is read-only (GET). POST /subscribe must use `HttpClient.post()`. [VERIFIED: @angular/common/http types, `httpResource` returns `ResourceRef<T | undefined>` with no mutation API]
- **`inject(ActivatedRoute).snapshot.queryParamMap`**: Avoid. Use `withComponentInputBinding()` + `@Input() token` / `input<string>('token')` instead — cleaner, signal-compatible, no RxJS subscription needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email format validation | Custom regex | `email()` from `@angular/forms/signals` | RFC 5322 edge cases (quoted strings, IPv6 literals); built-in handles standard cases |
| Route-to-component lazy loading | Manual `import()` + conditional rendering | `loadComponent` in route config | Automatic chunk splitting; router lifecycle hooks; preloading support |
| Query param reading | Manual `window.location.search` parsing | `withComponentInputBinding()` + `@Input()` | Handles encoding, type coercion, reactive updates |
| HTTP error classification | Try/catch on every call | Global `HttpInterceptorFn` | Single error handling point; avoids repetition across 3 API calls |
| Mock responses in dev | Separate dev server | `HttpInterceptorFn` + environment flag | No extra server; works offline; test exact response shapes |
| Screen reader announcements | Manual DOM manipulation with `aria-live` | `@angular/cdk/a11y` `LiveAnnouncer` | Handles browser differences; debounces announcements; correct priority levels |

**Key insight:** Angular's ecosystem handles the hard parts of form validation, routing, and HTTP interceptors. The only custom logic needed is the business rules: which API endpoints to call, what success/error states to show in Dutch.

---

## Common Pitfalls

### Pitfall 1: Signal Forms Breaking Changes Between Minor Versions

**What goes wrong:** Signal Forms is `@experimental`. Angular's changelog lists "Breaking Changes (affecting only experimental features)" in nearly every 21.x minor release. A patch upgrade may rename an API or change a type signature.

**Why it happens:** Experimental APIs have no stability contract in Angular's versioning policy.

**How to avoid:**
- Pin Angular to a specific minor version in `package.json`: `"@angular/core": "21.2.14"` (exact, no `~` or `^`)
- Read the `## Breaking Changes (affecting only experimental features)` section of the Angular changelog before upgrading
- Write a thin wrapper around Signal Forms primitives so that breakages are isolated

**Warning signs:** TypeScript compiler errors after running `npm update`; `form()` or `submit()` not found.

### Pitfall 2: `httpResource` for POST Mutations

**What goes wrong:** Developer uses `httpResource<T>(() => ({ method: 'POST', url: '...', body: model() }))` for the subscribe action. The resource re-fires on every signal change, potentially sending the form multiple times.

**Why it happens:** `httpResource` is designed for reactive GET data fetching (fires when request changes). It cancels in-progress loads on re-request, which is wrong for mutations.

**How to avoid:** POST /subscribe uses `HttpClient.post()` directly inside `submit()` action callback. Use `httpResource` ONLY for GET data loading (e.g., if a `/townships` endpoint existed). [VERIFIED: Angular docs: "resource is intended for read operations, not operations which perform mutations"]

**Warning signs:** Multiple POST calls observed in network tab; form submits on keystroke.

### Pitfall 3: Query Params Not Bound Without `withComponentInputBinding()`

**What goes wrong:** Developer adds `@Input() token` to `ConfirmComponent`, but the token is always empty string. The component never receives the `?token=X` value from the URL.

**Why it happens:** `@Input` binding from route data requires the `withComponentInputBinding()` feature flag to be passed to `provideRouter()`. Without it, Angular Router ignores the mapping.

**How to avoid:** In `app.config.ts`: `provideRouter(routes, withComponentInputBinding())`. Then `@Input() token` or `input<string>('token')` in the component is automatically bound. [VERIFIED: @angular/router types `withComponentInputBinding` docs]

**Warning signs:** `/confirm?token=abc123` renders but `this.token()` is `''` or `undefined`.

### Pitfall 4: Missing `<meta name="viewport">` for Mobile Responsiveness

**What goes wrong:** `ng new` generates `index.html` with viewport meta, but if it gets removed or never added, the app renders at desktop width on mobile and fails FE-07.

**How to avoid:** Verify `index.html` contains: `<meta name="viewport" content="width=device-width, initial-scale=1">`.

### Pitfall 5: WCAG AA — Errors Not Announced to Screen Readers

**What goes wrong:** Signal Forms validation errors appear visually but screen readers don't announce them because there's no `role="alert"` or `aria-live` region.

**Why it happens:** Signal Forms shows errors in the DOM, but silent DOM updates aren't read by screen readers unless the region is an ARIA live region.

**How to avoid:**
- Add `role="alert"` (for `assertive`) or `aria-live="polite"` to error `<p>` elements
- For form-level errors on submit, use `@angular/cdk/a11y` `LiveAnnouncer.announce('Formulier bevat fouten', 'assertive')` [ASSUMED — CDK LiveAnnouncer exists; exact API based on training data, confirm with official CDK docs]
- Use `aria-describedby` on inputs to link to their error element IDs

**Warning signs:** Axe accessibility scan reports "Form elements must have labels" or "ARIA input fields must have an accessible name".

### Pitfall 6: `ChangeDetectionStrategy.OnPush` Breaking Template Updates

**What goes wrong:** Component has `OnPush` but uses a plain class property (not a signal or observable) to hold some state. Angular never re-renders on changes to that property.

**Why it happens:** OnPush only triggers re-renders when: (1) an `@Input` reference changes, (2) an async pipe emits, or (3) a signal that the template reads is updated.

**How to avoid:** All mutable state in components must use `signal()`. Never use plain class properties for template-bound state with OnPush.

**Warning signs:** Clicking a button visually does nothing; submitting the form doesn't show the success state.

### Pitfall 7: `effect()` Infinite Loop on Form State

**What goes wrong:** Developer writes `effect(() => { if (subscribeForm().valid()) { this.canSubmit.set(true); } })` — both reading `subscribeForm()` and writing `canSubmit` inside the effect. In dev mode throws `NG0600`.

**How to avoid:** Use `computed()` for derived state: `readonly canSubmit = computed(() => this.subscribeForm().valid())`. [VERIFIED: @angular/core types; Angular changelog Pitfall 11 from PITFALLS.md]

### Pitfall 8: Signal Forms `[formField]` Attribute Name

**What goes wrong:** Developer uses `[field]="..."` or `[control]="..."` on form inputs (based on older Angular Signal Forms examples). The directive binding doesn't apply; inputs are uncontrolled.

**Why it happens:** Angular changelog shows: "fix: Rename signal form `[field]` to `[formField]`" — this rename happened during the experimental phase.

**How to avoid:** Always use `[formField]="..."` on form inputs. Example: `<input [formField]="myForm.email()" />`.

**Warning signs:** TypeScript error "Property 'field' does not exist" or form field state doesn't update when typing.

---

## API Stability Status (Critical for Planning)

| API | Package | Status in v21.2.14 | Risk |
|-----|---------|-------------------|------|
| `form()`, `FormField`, `submit()` | `@angular/forms/signals` | `@experimental 21.0.0` | Breaking changes between minor versions possible |
| `email()`, `required()` validators | `@angular/forms/signals` | `@experimental 21.0.0` | Same as above |
| `httpResource` | `@angular/common/http` | `@experimental 19.2` | Breaking changes possible |
| `resource()` | `@angular/core` | `@experimental 19.0` | Breaking changes possible |
| `withComponentInputBinding()` | `@angular/router` | `@publicApi` (stable) | No risk |
| `provideRouter()` | `@angular/router` | `@publicApi` (stable) | No risk |
| `provideHttpClient()` | `@angular/common/http` | `@publicApi` (stable) | No risk |
| `HttpClient` | `@angular/common/http` | `@publicApi` (stable) | No risk |
| `toSignal()` | `@angular/core/rxjs-interop` | `@publicApi 20.0` (stable) | No risk |
| `signal()`, `computed()`, `effect()` | `@angular/core` | `@publicApi` (stable) | No risk |
| `loadComponent` in Route | `@angular/router` | `@publicApi` (stable) | No risk |
| `inject()` | `@angular/core` | `@publicApi` (stable) | No risk |

> **[VERIFIED: npm registry]** — all stability annotations confirmed by extracting and reading
> `@angular/forms@21.2.14`, `@angular/common@21.2.14`, `@angular/core@21.2.14`, and
> `@angular/router@21.2.14` type definition files from the npm registry.

---

## Township List: Source of Truth

**Finding:** No `GET /townships` endpoint is defined in the Phase 2 architecture. The backend architecture (ARCHITECTURE.md lines 103–105) defines only:
- `POST /subscribe`
- `GET /confirm?token=X`
- `GET /unsubscribe?token=X`

**Decision:** The township list must be hardcoded in the Angular app as a TypeScript constant.

**Known township:** `id: "16", name: "Ede"` [VERIFIED: `src/check-availability.ts` line 24]

**Full list status:** [ASSUMED] — The complete list of ACV Groep trailer rental locations must be sourced from the ACV Groep website (`https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen`) or confirmed with the user. The `SetProfileOption` API uses numeric IDs; these IDs must match the backend's validation allowlist.

**Recommendation:** Create the `TOWNSHIPS` constant in `task 03-01` with just the known Ede entry (`id: '16'`). Add a TODO comment and a `checkpoint:human-verify` step requiring the user to fill in the complete list before 03-02 is complete. The backend's `POST /subscribe` validation must accept the same `townshipId` values.

---

## Environment and API Mock Strategy

### `environment.ts` pattern (Angular 17+ style)

```typescript
// src/environments/environment.ts  (dev)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',  // proxy to local Phase 2 backend (if running)
  useMockApi: true,                      // true = use mock interceptor when backend not available
};

// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://<api-gateway-id>.execute-api.eu-central-1.amazonaws.com',
  useMockApi: false,
};
```

> ⚠️ Angular 17+ does NOT generate `src/environments/` automatically with `ng new`. Run:
> `ng generate environments` after project creation. [ASSUMED — based on training data; verify post-scaffold]

### Angular Proxy for Phase 2 Backend (alternative to mock interceptor)

```json
// proxy.conf.json (used with ng serve --proxy-config proxy.conf.json)
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "changeOrigin": true
  }
}
```

This approach (proxy) works when Phase 2 Lambda is running locally via SAM CLI. The mock interceptor approach works completely offline with no backend dependency.

---

## WCAG AA Accessibility Patterns

All patterns below are required for FE-06.

### Form Accessibility Requirements

| Element | Required ARIA | Pattern |
|---------|---------------|---------|
| Email input | `id` + `<label for>` + `aria-required` + `aria-describedby` → error ID | `<label for="email">` → `<input id="email" aria-describedby="email-error">` |
| Township select | Same as email input | `<label for="township">` → `<select id="township" aria-required="true">` |
| Frequency radio group | `<fieldset>` + `<legend>` | Radios grouped in `<fieldset><legend>Hoe vaak?</legend>` |
| Error messages | `role="alert"` (assertive) or `aria-live="polite"` | `<p id="email-error" role="alert">...</p>` — rendered only when error exists |
| Success message | `role="status"` (polite) | `<p role="status">Controleer je e-mail...</p>` |
| Submit button | `[disabled]` during submitting | Prevents double-submit; also visual feedback |

### Keyboard Navigation

- All form controls must be reachable by Tab
- Select dropdown: native `<select>` handles keyboard natively
- Radio group inside `<fieldset>`: arrow keys to cycle, Tab to exit group
- Error links (if form-level): implement focus-on-error via `FormField.focus()` [ASSUMED — CDK pattern; verify with CDK a11y docs]

### Mobile Responsiveness (FE-07)

- Minimum viewport: 375px (iPhone SE)
- Form should be single-column on mobile
- Touch target size: minimum 44×44px (WCAG 2.5.5)
- `type="email"` on email input triggers correct mobile keyboard
- `font-size: 16px` minimum on inputs to prevent iOS auto-zoom

---

## `ng build` Production Bundle Optimization

Angular 21 with the `application` builder (default in v17+):

- **Automatic tree shaking**: Esbuild removes unused imports
- **Lazy chunks**: Each `loadComponent()` route produces a separate `.js` chunk
- **Output path**: `dist/acv-frontend/browser/` (Angular 17+ application builder outputs to `browser/` subdirectory)
- **Content hashing**: `main.<hash>.js` — safe to cache with 1-year TTL; `index.html` must not be cached

**Build verification:**
```bash
cd frontend/
ng build --configuration=production
ls dist/acv-frontend/browser/  # should contain index.html + hashed chunks
```

**Bundle size targets** (indicative):
- Initial bundle: < 150KB gzipped (Angular itself ~70KB gzipped; app code small)
- Per lazy route chunk: < 30KB gzipped

---

## Validation Architecture

nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Karma + Jasmine (Angular CLI default for v21) |
| Config file | `karma.conf.js` (generated by `ng new`) |
| Quick run command | `ng test --watch=false --browsers=ChromeHeadless` |
| Full suite command | `ng test --watch=false --code-coverage --browsers=ChromeHeadless` |

> **Note:** Jest is an alternative via `@angular-builders/jest` + `jest-preset-angular`. Angular CLI 21 still defaults to Karma. For this project, Karma is acceptable (no SSR, no Edge Runtime constraints).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| FE-01 | Standalone component bootstraps | Smoke | `ng test --include=**/app.component.spec.ts` |
| FE-02 | Email validation rejects invalid formats | Unit | `ng test --include=**/subscribe.component.spec.ts` |
| FE-02 | Township required validation | Unit | Same file |
| FE-03 | Success state shown after submit | Unit | Same file — mock HttpClient with `provideHttpClientTesting()` |
| FE-04 | Confirm component reads `?token` input | Unit | `ng test --include=**/confirm.component.spec.ts` |
| FE-05 | Unsubscribe component reads `?token` input | Unit | `ng test --include=**/unsubscribe.component.spec.ts` |
| SUB-01 | POST /subscribe called on valid form submit | Unit | Subscribe component spec with `HttpTestingController` |
| COMP-01 | Privacy link renders in subscribe form | Unit | Subscribe component spec |

### Wave 0 Gaps (must exist before implementation)

- [ ] `frontend/src/app/subscribe/subscribe.component.spec.ts` — covers FE-02, FE-03, SUB-01
- [ ] `frontend/src/app/confirm/confirm.component.spec.ts` — covers FE-04
- [ ] `frontend/src/app/unsubscribe/unsubscribe.component.spec.ts` — covers FE-05
- [ ] `frontend/karma.conf.js` — generated by `ng new` (Wave 0: scaffold)

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` per config.json.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this app |
| V3 Session Management | No | No session |
| V4 Access Control | No | Public-only SPA |
| V5 Input Validation | Yes | Signal Forms validators (client-side); backend re-validates |
| V6 Cryptography | No | No crypto in frontend |
| V7 Error Handling | Yes | No stack traces exposed; error messages in Dutch, generic |
| V14 Config | Partial | `environment.prod.ts` must NOT include `useMockApi: true`; no secrets in frontend bundle |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-controlled content in error messages | Spoofing | Angular template binding (`{{ }}`) auto-escapes HTML; never use `[innerHTML]` with user data |
| CSRF on POST /subscribe | Tampering | API Gateway CORS allowlist (Phase 2 concern); Angular `HttpClient` does not add CSRF header by default for cross-origin (correct) |
| Open redirect | Elevation | No user-controlled redirects in this app; `redirectTo: ''` only in route config |
| Information disclosure in error messages | Information Disclosure | Show generic Dutch error text; never expose API error detail to UI |
| Mock interceptor in production bundle | Tampering | `useMockApi` flag in `environment.prod.ts` must be `false`; mock interceptor not added to prod providers |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NgModule` + `BrowserModule` | `bootstrapApplication()` + `provideRouter()` | Angular 14–17 | No modules anywhere; cleaner tree shaking |
| `*ngIf` / `*ngFor` directives | `@if` / `@for` control flow | Angular 17 | Built into compiler; better performance; no need to import `CommonModule` |
| `ReactiveFormsModule` + `FormBuilder` | Signal Forms `form()` (experimental) | Angular 20 | Signals-native; no `ValueChanges` observables; type-safe model |
| `ActivatedRoute.queryParamMap` | `withComponentInputBinding()` + `@Input()` | Angular 16 | No RxJS subscription; clean component interface |
| Class-based `HttpInterceptor` | Functional `HttpInterceptorFn` | Angular 15 | Works with `inject()`; no class boilerplate |
| `RouterModule.forRoot()` | `provideRouter()` | Angular 15 | Functional; tree-shakable |

**Deprecated/outdated:**
- `HttpClientModule`: Use `provideHttpClient()` — module is deprecated per Angular 21 docs
- `withInterceptorsFromDi()`: Use `withInterceptors([fn])` — class-based DI interceptors "may be phased out" per Angular docs [VERIFIED: @angular/common/http types]
- `NgModel` + `FormsModule` (template-driven): Acceptable but not signals-native; not for this project

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Full list of ACV Groep township IDs (beyond Ede=16) | Township List | App dropdown shows incomplete locations; users in other municipalities can't subscribe |
| A2 | `ng generate environments` needed post-scaffold in Angular 17+ | Environment Strategy | Build may fail if environment files not generated; easily fixed |
| A3 | Karma is the default test runner for Angular CLI 21 | Validation Architecture | Tests might need different config if CLI changed default |
| A4 | Angular CDK `LiveAnnouncer.announce()` API syntax | WCAG Patterns | Minor API adjustment; CDK docs are easy to verify |

---

## Open Questions

1. **Complete ACV Groep township list**
   - What we know: `id: "16"` = Ede
   - What's unclear: All other valid township IDs and their display names
   - Recommendation: Add `checkpoint:human-verify` in task 03-02 before the subscribe form is considered complete; user must verify the township list against https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen

2. **Signal Forms vs ReactiveFormsModule risk tolerance**
   - What we know: Signal Forms is `@experimental`; ReactiveFormsModule is `@publicApi` stable
   - What's unclear: Whether the user accepts experimental API risk
   - Recommendation: Proceed with Signal Forms per locked stack decisions; pin Angular version exactly; document fallback pattern in code comments

3. **Phase 2 API URL for local dev**
   - What we know: Phase 2 is not deployed yet; `apiUrl` in `environment.ts` is a placeholder
   - What's unclear: Will Phase 2 be running locally (SAM CLI) or mocked entirely?
   - Recommendation: Default to mock interceptor (`useMockApi: true`) with a comment to switch to proxy when Phase 2 is available

---

## Environment Availability

| Dependency | Required By | Available | Notes | Fallback |
|------------|------------|-----------|-------|---------|
| Node.js 22+ | `ng build`, `ng serve` | [ASSUMED] present | Needed for Angular CLI 21 | — |
| `@angular/cli` | `ng new`, `ng build` | Not yet installed (no `frontend/` dir) | Must be installed globally or via `npx @angular/cli` | `npx @angular/cli@21.2.12` |
| Chrome/Chromium | Karma tests | [ASSUMED] present | `ChromeHeadless` for CI | `--no-sandbox` flag for CI |
| Phase 2 API | `/subscribe`, `/confirm`, `/unsubscribe` | ✗ Not deployed | Mock interceptor covers dev | Mock API interceptor |

---

## Sources

### Primary (HIGH confidence)
- `@angular/forms@21.2.14` npm package — types/signals.d.ts, types/_structure-chunk.d.ts — Signal Forms API shape and `@experimental` status [VERIFIED: npm registry]
- `@angular/common@21.2.14` npm package — types/http.d.ts — `httpResource` `@experimental 19.2` status [VERIFIED: npm registry]
- `@angular/core@21.2.14` npm package — types/core.d.ts — `resource()` `@experimental 19.0` status [VERIFIED: npm registry]
- `@angular/router@21.2.14` npm package — types/router.d.ts — `withComponentInputBinding` `@publicApi` stable; `loadComponent` in Route interface [VERIFIED: npm registry]
- `@angular/core/rxjs-interop@21.2.14` — `toSignal` `@publicApi 20.0` stable [VERIFIED: npm registry]
- Angular GitHub CHANGELOG.md (raw) — "graduate signal forms APIs to public API" (means public export, NOT stable); breaking changes in experimental features [VERIFIED: github.com/angular/angular]
- `src/check-availability.ts` — `TOWNSHIP = "16"` (Ede) [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- Angular architecture research (`.planning/research/ARCHITECTURE.md`) — backend API routes (POST /subscribe, GET /confirm, GET /unsubscribe); no GET /townships [VERIFIED: prior project research]
- `.planning/research/STACK.md` — Angular 21 patterns (some claims re-verified against actual types)
- `.planning/research/PITFALLS.md` — Pitfall 11 (effect() infinite loop), Pitfall 12 (CloudFront cache)

### Tertiary (LOW confidence / ASSUMED)
- `ng generate environments` command for Angular 17+
- CDK `LiveAnnouncer` method signature
- Full ACV Groep township list beyond Ede

---

## Metadata

**Confidence breakdown:**
- Signal Forms API shape: HIGH — verified from published types in npm registry
- Signal Forms stability (`@experimental`): HIGH — verified from published types
- `httpResource` stability: HIGH — verified from published types
- Router patterns (loadComponent, withComponentInputBinding): HIGH — verified from published types
- Township list completeness: LOW — only one entry verified from codebase
- Accessibility patterns: MEDIUM — ARIA patterns well-established; CDK-specific API not verified

**Research date:** 2025-06-13
**Valid until:** 2025-08-01 (experimental APIs may change in Angular 22 or 21.x patches; re-verify before upgrading)
