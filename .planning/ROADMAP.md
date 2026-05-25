# Roadmap: ACV Aanhanger Beschikbaarheid

## Overview

The build starts with a locked-down AWS foundation — DynamoDB, SES identity, and an EventBridge cron skeleton — because SES production access and DKIM DNS propagation carry external approval timelines (24–72 h) that cannot be parallelised with development work. Phase 2 delivers the complete serverless backend in one cohesive push: the subscription API (double opt-in, rate limiting, GDPR hard-delete) and the migrated CheckerLambda (per-township scrape loop, DynamoDB cache, SES notification fan-out). Phase 3 builds the Angular 21+ SPA locally — standalone components, Signal Forms, township picker, frequency selector — entirely decoupled from the CDK deploy. Phase 4 is the final integration: S3 + CloudFront hosting, ACM certificate in `us-east-1`, custom domain, and a full end-to-end smoke test in production. When Phase 4 completes, subscribers receive emails the moment a new trailer slot appears — without ever manually checking the ACV website.

---

## Phases

- [ ] **Phase 1: Infrastructure Foundation** — CDK monorepo scaffolded; StatefulStack (DynamoDB + SES) deployed; DNS records added; SES production access request filed
- [ ] **Phase 2: Backend — Subscription API + Checker + Notifications** — ApiLambda (double opt-in flow), CheckerLambda (migrated scraper, DynamoDB cache), SES email delivery, GDPR compliance all wired and deployed
- [ ] **Phase 3: Angular SPA** — Full public UI: subscribe form (township picker + frequency), confirmation page, unsubscribed page, privacy policy — accessible and responsive
- [ ] **Phase 4: Frontend Hosting + Production Hardening** — S3 + CloudFront, ACM cert (us-east-1), custom domain, end-to-end smoke test, CloudWatch alarms — app live in production

---

## Phase Details

### Phase 1: Infrastructure Foundation
**Goal**: The CDK monorepo is bootstrapped and deployed; DynamoDB table and SES identity exist in AWS; DKIM/SPF/DMARC DNS records are added to the registrar; SES production access request is filed and in queue; EventBridge cron rule skeleton is in place. All external approval timers are running.
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, CHK-02
**Success Criteria** (what must be TRUE):
  1. `cdk deploy StatefulStack` completes without errors; DynamoDB `TableV2` with GSI1 and GSI2 is visible in the AWS console with termination protection enabled
  2. SES domain identity for `noreply@acv-aanhanger.nl` shows DKIM CNAME records as "Pending verification" (DNS records have been added to the registrar)
  3. SES account-level suppression list is enabled; SES production access support request has been filed with ticket number recorded in project notes — ⚠️ this is a blocking dependency for Phase 2 email sending
  4. EventBridge cron rule (every 10 minutes) is deployed and shows as **Enabled** in the AWS console, even though its CheckerLambda target is a placeholder
  5. `cdk synth` produces valid CloudFormation output for both `StatefulStack` and `BackendStack` stacks with no drift warnings
**Plans**: 4 plans

Plans:
- [ ] 01-01: Monorepo scaffold — `frontend/`, `backend/`, `infrastructure/` directory structure; CDK app init (`cdk init app --language typescript`); shared `tsconfig.json`; `.gitignore` for CDK artifacts; document `cdk bootstrap` command in README
- [ ] 01-02: `StatefulStack` — `dynamodb.TableV2` (on-demand billing, PITR on, `RETAIN` removal policy) with GSI1 (`confirmed` + `townshipId` for subscriber fan-out) and GSI2 (`unsubscribeToken` lookup); SES `EmailIdentity` for `noreply@acv-aanhanger.nl`; SES `ConfigurationSet` with account-level suppression
- [ ] 01-03: SES DNS hardening + production access — extract CDK-generated DKIM CNAME records; add DKIM, SPF, and DMARC TXT records to domain registrar; verify SES identity status; file SES production access request with transactional + double opt-in description
- [ ] 01-04: `BackendStack` skeleton — `NodejsFunction` placeholder for `CheckerLambda` and `ApiLambda`; EventBridge `Rule` with `schedule: events.Schedule.rate(Duration.minutes(10))` targeting `CheckerLambda`; API Gateway HTTP API v2 (`HttpApi`) with CORS preflight; pass `tableArn` / `tableName` from `StatefulStack` via CDK stack outputs

---

### Phase 2: Backend — Subscription API + Checker + Notifications
**Goal**: The complete serverless backend is deployed and functional: `POST /subscribe` → confirmation email → `GET /confirm` → confirmed subscriber; `CheckerLambda` scrapes ACV per township, diffs against DynamoDB cache, and sends notification emails (immediately or daily digest) to confirmed subscribers; `GET /unsubscribe` hard-deletes the record. GDPR and RFC 8058 compliance are built in from day one.

> ⚠️ **SES sandbox dependency**: Confirmation and notification emails cannot reach non-verified addresses until SES production access is approved (filed in Phase 1, SLA 24–72 h). Test against SES-verified addresses until sandbox exit is confirmed.

**Depends on**: Phase 1
**Requirements**: SUB-04, SUB-05, SUB-06, SUB-07, SUB-08, SUB-09, SUB-10, UNSUB-01, UNSUB-03, UNSUB-04, CHK-01, CHK-03, CHK-04, CHK-05, CHK-06, CHK-07, CHK-08, NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):
  1. `POST /subscribe` with a valid email + townshipId creates a `PENDING` DynamoDB record and triggers a Dutch-language confirmation email; a duplicate request silently resends the confirmation (no duplicate record); rate limit rejects a sixth request from the same IP within 60 seconds
  2. Clicking the confirmation link (`GET /confirm?token=X`) marks the record `confirmed: true` with a consent timestamp using a `ConditionExpression`; replaying the same token returns a graceful "already confirmed" response; an expired token (>24 h) returns a friendly error
  3. Clicking an unsubscribe link (`GET /unsubscribe?token=X`) hard-deletes the DynamoDB record immediately; replaying the token returns "already unsubscribed"; no `UNSUBSCRIBED` status record remains in the table
  4. Manually invoking `CheckerLambda` against a township with at least one confirmed subscriber detects new slots, writes the updated cache to DynamoDB (`CACHE#<townshipId>`), and delivers a Dutch-language notification email with slot details and an unsubscribe link in the footer
  5. All outbound emails carry `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058); "daily digest" subscribers receive one aggregated email per day, not one per checker run
**Plans**: 4 plans

Plans:
- [ ] 02-01: DynamoDB schema + access patterns — implement subscriber record shape (`PK=SUB#<email>`, `SK=TOWNSHIP#<id>`, `confirmed`, `frequency`, `consentTimestamp`, `unsubscribeToken`, `ttl`); cache record shape (`PK=CACHE#<townshipId>`, `SK=CACHE`); TTL attribute on PENDING records (24 h); verify GSI1 and GSI2 query patterns with integration tests against DynamoDB local or real table
- [ ] 02-02: `ApiLambda` — `POST /subscribe` (zod validation, duplicate guard with `ConditionExpression`, rate-limit check, SES confirmation email dispatch); `GET /confirm` (conditional write: `attribute_exists(PK) AND confirmed = false`; consent timestamp); `GET /unsubscribe` (two-step: GET returns Angular redirect token, POST performs `DeleteItem`; single-use token guard); all routes handle 400/409/410 cleanly; wire into API Gateway HTTP API v2
- [ ] 02-03: `CheckerLambda` — migrate `src/check-availability.ts` to Lambda handler; replace file-based cache with DynamoDB `GetItem` / `PutItem` (`CACHE#<townshipId>`); replace single-township env var with GSI1 query to discover active townships; wrap ACV calendar response in zod schema (never write cache on parse failure / `days.length < 10`); `Promise.allSettled` per township to isolate failures; SES fan-out to "immediately" subscribers per run; accumulate daily digest batches for "daily digest" subscribers via a DynamoDB digest-queue item (or scheduled SES batch send)
- [ ] 02-04: SES email templates + compliance — Dutch-language HTML + plain-text templates for: (a) double opt-in confirmation, (b) slot notification (slot dates, times, ACV booking link, unsubscribe footer), (c) daily digest (aggregated slots); embed `List-Unsubscribe` / `List-Unsubscribe-Post` headers on all outbound mail; privacy policy link in confirmation email footer; GDPR consent timestamp stored on confirm

---

### Phase 3: Angular SPA
**Goal**: The public-facing Angular 21+ app is complete and runs correctly against the deployed API: the subscribe form (township picker, frequency selector, Signal Forms validation) captures and submits subscriptions; confirmation, unsubscribed, and privacy policy pages are all functional; the app meets WCAG AA accessibility and is responsive on mobile.
**Depends on**: Phase 1 (API base URL), Phase 2 (endpoints live for integration testing)
**Requirements**: SUB-01, SUB-02, SUB-03, UNSUB-02, FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, FE-07, COMP-01
**Success Criteria** (what must be TRUE):
  1. Opening the app in a browser shows the subscribe form with a populated township dropdown (all ACV Groep locations) and a frequency selector ("Immediately" / "Daily digest"); the submit button is disabled until a valid email, township, and frequency are selected
  2. Submitting a valid form calls `POST /subscribe`, shows a success state ("Controleer je e-mail"), and clears the form; submitting an invalid email shows a Dutch inline validation message without calling the API
  3. Navigating to `/bevestigen?token=X` displays a confirmation success page; navigating to `/uitschrijven?token=X` displays an "Uitgeschreven" page — both routes work on direct browser reload (no 404)
  4. A privacy policy page is reachable via the link on the subscribe form
  5. All form controls have ARIA labels and are fully keyboard-navigable (Tab/Enter); the layout is readable and usable on a 375 px viewport without horizontal scroll
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [x] 03-01: Angular project scaffold — `ng new acv-frontend --standalone --style=scss --routing=true` inside `frontend/`; `provideRouter()` + `provideHttpClient()`; lazy-loaded route components for `/`, `/bevestigen`, `/uitschrijven`, `/privacy`; `ChangeDetectionStrategy.OnPush` on all components; environment config (`environment.ts`) for API base URL; Vitest replaces Karma
- [ ] 03-02: Subscribe form component — Signal Forms (`form()` + validators); `email` field with RFC 5322 validation; `townshipId` dropdown loaded via `httpResource<Township[]>`; `frequency` radio group ("Meteen" / "Dagelijks overzicht"); form submit calls `POST /subscribe`; success state shows "Controleer je e-mail" message; duplicate/rate-limit errors handled gracefully
- [ ] 03-03: Confirmation, unsubscribed, and privacy pages — `/bevestigen?token=X` reads token via `input<string>()` + `withComponentInputBinding()`, calls `GET /api/confirm`, shows success or error state; `/uitschrijven?token=X` reads token, calls `GET /api/unsubscribe`, shows "Uitgeschreven" or error state; `/privacy` static Dutch-language privacy policy page; all pages accessible (ARIA, keyboard nav, mobile-responsive)
- [ ] 03-04: API integration + error handling — `SubscriptionService` wrapping all API calls with typed zod-aligned request/response models; global HTTP error interceptor (network failures, 4xx, 5xx → user-friendly Dutch messages); CORS verified against deployed API Gateway; `ng build` produces clean production bundle with no lint errors

---

### Phase 4: Frontend Hosting + Production Hardening
**Goal**: The Angular app is deployed to S3 + CloudFront with a custom domain and valid ACM certificate; all production dependencies (SES out of sandbox, DKIM verified, CORS locked down, CloudWatch alarms) are confirmed live; a full end-to-end subscriber flow (subscribe → confirm → checker run → notification → unsubscribe) passes in the production environment.

> ⚠️ **ACM certificate MUST be created in `us-east-1`** regardless of the CDK stack's primary region — this is a hard CloudFront requirement. Use a separate CDK `Stack` with `env: { region: 'us-east-1' }` for the certificate.

**Depends on**: Phase 3
**Requirements**: INFRA-08
**Success Criteria** (what must be TRUE):
  1. Opening `https://acv-aanhanger.nl` (or the configured custom domain) in a browser serves the Angular app over HTTPS with a valid certificate; directly navigating to `/confirm` or `/unsubscribe` returns the app (Angular Router handles routing), not a CloudFront 403/404
  2. The complete subscriber flow works against production AWS resources with SES **out of sandbox**: subscribe → receive confirmation email → click confirm → `CheckerLambda` detects a new slot → notification email arrives with slot details and unsubscribe link → unsubscribe removes the DynamoDB record
  3. Hashed JS/CSS assets are served with `Cache-Control: max-age=31536000, immutable`; `index.html` is served with `Cache-Control: no-cache, no-store`; CloudFront invalidation (`/*`) runs automatically on each `BucketDeployment`
  4. A simulated `CheckerLambda` error (forced throw) triggers a CloudWatch alarm; SES dashboard confirms suppression list is active and DKIM status is "Verified" for `noreply@acv-aanhanger.nl`
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 04-01: S3 + CloudFront CDK construct — `BackendStack` gets `aws_s3.Bucket` (block all public access) + `aws_cloudfront.Distribution` with `S3BucketOrigin`; `ErrorResponse` for 403 and 404 returning `/index.html` with HTTP 200 (Angular SPA routing); `BucketDeployment` with `sources: [Source.asset('../../frontend/dist/acv-frontend/browser')]` and `distributionPathsToInvalidate: ['/*']`; cache policy: long TTL for `*.js`/`*.css`, `no-cache` for `index.html`
- [ ] 04-02: ACM certificate + custom domain — create `aws_certificatemanager.Certificate` in a dedicated `CertStack` with `env: { region: 'us-east-1' }` (hard CloudFront requirement); add certificate ARN to CloudFront distribution `domainNames`; add CloudFront distribution domain as CNAME in DNS registrar; verify HTTPS redirect and certificate validity in browser
- [ ] 04-03: End-to-end smoke test — deploy all stacks to production (`cdk deploy --all`); run full subscriber flow against production endpoints: `POST /subscribe` → receive and click confirmation email → verify DynamoDB record → manually trigger `CheckerLambda` → verify notification email received → click unsubscribe → verify DynamoDB record deleted; confirm SES is out of sandbox (emails arrive at non-verified addresses)
- [ ] 04-04: Production hardening — CORS origin on API Gateway locked to `https://acv-aanhanger.nl`; CloudWatch alarm on `CheckerLambda` error rate (>0 errors/run); CloudWatch alarm on SES bounce rate (>2%); verify SES account-level suppression list active; `README.md` updated with `cdk deploy` instructions and DNS checklist for future re-deploys

---

## Progress

**Execution Order:** Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 0/4 | Not started | - |
| 2. Backend — Subscription API + Checker + Notifications | 0/4 | Not started | - |
| 3. Angular SPA | 1/4 | In Progress|  |
| 4. Frontend Hosting + Production Hardening | 0/4 | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Pending |
| INFRA-08 | Phase 4 | Pending |
| CHK-02 | Phase 1 | Pending |
| SUB-01 | Phase 3 | Pending |
| SUB-02 | Phase 3 | Pending |
| SUB-03 | Phase 3 | Pending |
| SUB-04 | Phase 2 | Pending |
| SUB-05 | Phase 2 | Pending |
| SUB-06 | Phase 2 | Pending |
| SUB-07 | Phase 2 | Pending |
| SUB-08 | Phase 2 | Pending |
| SUB-09 | Phase 2 | Pending |
| SUB-10 | Phase 2 | Pending |
| UNSUB-01 | Phase 2 | Pending |
| UNSUB-02 | Phase 3 | Pending |
| UNSUB-03 | Phase 2 | Pending |
| UNSUB-04 | Phase 2 | Pending |
| CHK-01 | Phase 2 | Pending |
| CHK-03 | Phase 2 | Pending |
| CHK-04 | Phase 2 | Pending |
| CHK-05 | Phase 2 | Pending |
| CHK-06 | Phase 2 | Pending |
| CHK-07 | Phase 2 | Pending |
| CHK-08 | Phase 2 | Pending |
| NOTIF-01 | Phase 2 | Pending |
| NOTIF-02 | Phase 2 | Pending |
| NOTIF-03 | Phase 2 | Pending |
| NOTIF-04 | Phase 2 | Pending |
| FE-01 | Phase 3 | Pending |
| FE-02 | Phase 3 | Pending |
| FE-03 | Phase 3 | Pending |
| FE-04 | Phase 3 | Pending |
| FE-05 | Phase 3 | Pending |
| FE-06 | Phase 3 | Pending |
| FE-07 | Phase 3 | Pending |
| COMP-01 | Phase 3 | Pending |
| COMP-02 | Phase 2 | Pending |
| COMP-03 | Phase 2 | Pending |

**v1 requirements mapped: 44/44 ✓**
**Unmapped: 0 ✓**

---
*Roadmap created: 2026-05-25*
*Granularity: standard (4 phases, 4 plans each)*
