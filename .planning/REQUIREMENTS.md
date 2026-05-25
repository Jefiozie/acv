# Requirements: ACV Aanhanger Beschikbaarheid

**Defined:** 2026-05-25
**Core Value:** Subscribers get notified the moment a new trailer slot appears — without having to manually check the ACV website.

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: AWS CDK v2 stack defines all infrastructure as code (DynamoDB, Lambda, SES, S3, CloudFront, EventBridge)
- [ ] **INFRA-02**: `StatefulStack` contains DynamoDB table + SES identity (termination protection enabled)
- [ ] **INFRA-03**: `BackendStack` contains Lambda functions, API Gateway (HTTP API v2), EventBridge cron rule
- [ ] **INFRA-04**: SES sending identity verified with DKIM/SPF DNS records (sending from `noreply@acv-aanhanger.nl` placeholder — must be updated to real domain before go-live)
- [ ] **INFRA-05**: SES account-level suppression list enabled
- [ ] **INFRA-06**: SES production access request filed (unblocks sending to unverified addresses)
- [ ] **INFRA-07**: DynamoDB single table with GSI1 (confirmed subscribers per township) and GSI2 (subscriber by unsubscribe token)
- [ ] **INFRA-08**: Angular SPA deployed to S3 + CloudFront; CloudFront returns `index.html` on 403/404 for Angular Router support

### Subscription

- [x] **SUB-01**: User can submit subscribe form with email address and township selection
- [x] **SUB-02**: Township picker lists all supported ACV Groep locations by name
- [x] **SUB-03**: User chooses notification frequency: "Immediately" or "Daily digest"
- [ ] **SUB-04**: Duplicate subscription (same email + township) is rejected silently (no error exposed, confirmation email resent)
- [ ] **SUB-05**: Subscribe endpoint is rate-limited per IP to prevent abuse
- [ ] **SUB-06**: Confirmation email is sent to subscriber immediately after form submission (double opt-in)
- [ ] **SUB-07**: Confirmation email contains a single-use token link (expires after 24h)
- [ ] **SUB-08**: User confirms subscription by clicking the link in the confirmation email
- [ ] **SUB-09**: Confirmation uses DynamoDB `ConditionExpression` to prevent race conditions and replay attacks
- [ ] **SUB-10**: Confirmed subscriber record stores: email, township, frequency, confirmed boolean, consent timestamp, unsubscribe token

### Unsubscribe

- [ ] **UNSUB-01**: Every notification email contains a one-click unsubscribe link (RFC 8058 `List-Unsubscribe-Post` header + footer link)
- [x] **UNSUB-02**: Unsubscribe link resolves to a confirmation page in the Angular app
- [ ] **UNSUB-03**: Clicking unsubscribe hard-deletes the subscriber record from DynamoDB immediately (GDPR/AVG Art. 17)
- [ ] **UNSUB-04**: Unsubscribe token is single-use; replayed tokens return a graceful "already unsubscribed" response

### Availability Checker

- [ ] **CHK-01**: Lambda function scrapes ACV Groep calendar API per township (session auth: PHPSESSID + visitor_id)
- [ ] **CHK-02**: Lambda is triggered by EventBridge cron rule (every 10 minutes)
- [ ] **CHK-03**: Availability cache is stored in DynamoDB (keyed `CACHE#<townshipId>`) — not on the file system
- [ ] **CHK-04**: Only townships with at least one confirmed subscriber are scraped each run
- [ ] **CHK-05**: Scraper failure (bad session, empty response, schema mismatch) throws a hard error (no silent cache overwrite)
- [ ] **CHK-06**: New/changed slots are detected by diffing current availability against the cached state
- [ ] **CHK-07**: "Immediately" subscribers receive an email for each checker run that detects new slots for their township
- [ ] **CHK-08**: "Daily digest" subscribers receive one aggregated email per day with all new slots detected since the last digest

### Notifications

- [ ] **NOTIF-01**: Notification email lists available date(s), time slot(s), and a link to the ACV booking page
- [ ] **NOTIF-02**: Notification email is formatted in Dutch
- [ ] **NOTIF-03**: Notification email includes unsubscribe link in footer
- [ ] **NOTIF-04**: SES sends notifications only to confirmed subscribers (GSI1 query)

### Frontend

- [x] **FE-01**: Angular 21+ SPA — standalone components, signals, new `@if`/`@for` control flow, no NgModules
- [x] **FE-02**: Subscribe form validates email format and requires township + frequency selection before submit
- [x] **FE-03**: Form shows success state after submission (instructs user to check email)
- [x] **FE-04**: Confirmation page shown when user clicks the confirmation link from email
- [x] **FE-05**: Unsubscribed page shown after unsubscribe link is followed
- [x] **FE-06**: App is accessible (WCAG AA): keyboard navigable, ARIA labels on form controls
- [x] **FE-07**: App is responsive (mobile-first)

### Compliance

- [x] **COMP-01**: Privacy policy page linked from the subscription form (required under GDPR/AVG)
- [ ] **COMP-02**: Consent timestamp stored with each subscriber record at confirmation
- [ ] **COMP-03**: Hard-delete on unsubscribe (no soft-delete; no retention)

## v2 Requirements

### Subscriber Self-Service

- **MGMT-01**: Subscriber can update their frequency preference via a link in notification emails
- **MGMT-02**: Subscriber can add a second township without re-subscribing

### Admin / Observability

- **ADMIN-01**: Admin dashboard to view subscriber counts per township
- **ADMIN-02**: Manual trigger for the checker Lambda from a protected admin endpoint
- **ADMIN-03**: CloudWatch alarms on scraper failure rate + SES bounce rate

### Notifications

- **NOTIF-05**: Weekly digest frequency option
- **NOTIF-06**: Subscriber can set a custom date range instead of the default 14-day window

## Out of Scope

| Feature | Reason |
|---------|--------|
| User login / accounts | Email-based unsubscribe is sufficient for v1; accounts add auth complexity |
| User dashboard | v1 is subscribe + unsubscribe only; management deferred to v2 |
| Telegram notifications | Replaced by email for the public app; existing Telegram script stays as-is |
| Specific date/time targeting | Users subscribe for any slot in 14 days; per-date selection deferred to v2 |
| Admin panel | CloudWatch + SES console covers v1 operations |
| Mobile app | Web-first; Angular PWA possible in v2 |
| Multi-language support | Dutch only for v1 |

## Traceability

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
| SUB-01 | Phase 3 | Complete |
| SUB-02 | Phase 3 | Complete |
| SUB-03 | Phase 3 | Complete |
| SUB-04 | Phase 2 | Pending |
| SUB-05 | Phase 2 | Pending |
| SUB-06 | Phase 2 | Pending |
| SUB-07 | Phase 2 | Pending |
| SUB-08 | Phase 2 | Pending |
| SUB-09 | Phase 2 | Pending |
| SUB-10 | Phase 2 | Pending |
| UNSUB-01 | Phase 2 | Pending |
| UNSUB-02 | Phase 3 | Complete |
| UNSUB-03 | Phase 2 | Pending |
| UNSUB-04 | Phase 2 | Pending |
| CHK-01 | Phase 2 | Pending |
| CHK-02 | Phase 1 | Pending |
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
| FE-01 | Phase 3 | Complete |
| FE-02 | Phase 3 | Complete |
| FE-03 | Phase 3 | Complete |
| FE-04 | Phase 3 | Complete |
| FE-05 | Phase 3 | Complete |
| FE-06 | Phase 3 | Complete |
| FE-07 | Phase 3 | Complete |
| COMP-01 | Phase 3 | Complete |
| COMP-02 | Phase 2 | Pending |
| COMP-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-25*
*Last updated: 2026-05-25 after initial definition*
