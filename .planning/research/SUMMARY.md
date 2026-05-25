# Project Research Summary

**Project:** ACV Aanhanger Beschikbaarheid
**Domain:** Serverless event-driven email subscription / notification service (AWS)
**Researched:** 2025-06-12
**Confidence:** HIGH

---

## Executive Summary

ACV Aanhanger is a narrow-scope serverless notification app: users subscribe (email + township), a scheduled Lambda scrapes the ACV availability calendar, and SES delivers emails when new slots appear. The stack is fixed by the project owner (Angular 21+, AWS CDK, Lambda, DynamoDB, SES) and research confirms all choices are correct — no alternatives needed. The existing `src/check-availability.ts` is directly portable to Lambda with two targeted changes: swap the file-based cache for DynamoDB and swap the Telegram send for SES fan-out.

The critical dependency that governs the entire timeline is **SES production access**. AWS starts every account in sandbox mode (can only send to pre-verified addresses); leaving sandbox requires a manual support request with a 24–72 hour approval SLA. This request must be filed in Phase 1 — before any frontend or notification work begins. Alongside it, domain/DKIM DNS records need propagation time (up to 72 hours), which makes the infra phase a prerequisite blocker, not something that can be done in parallel.

The top implementation risk is the ACV scraper's fragility: the scraping session (PHPSESSID + visitor_id) can silently succeed while returning bad data, causing the cache to be overwritten with empty state and real slot openings to be missed indefinitely. The mitigation — validate response shape with zod and never write cache on a failed scrape — must be built into the checker Lambda from the start, not added later.

---

## Key Findings

### Recommended Stack (confirmed — no changes)

See [STACK.md](./STACK.md) for full details and code patterns.

| Technology | Version | Purpose |
|------------|---------|---------|
| `@angular/core` + CLI | 21.2.x | Frontend — signals, standalone components, Signal Forms, `@if/@for` control flow |
| `aws-cdk-lib` | 2.257.x | All infra as code (CDK v2 single-package) |
| `aws-lambda` NodejsFunction | NODEJS_22_X | Lambda runtime — bundle AWS SDK, do not externalize |
| `dynamodb.TableV2` | CDK built-in | Preferred DynamoDB construct; on-demand billing |
| `@aws-sdk/client-sesv2` | 3.1053.x | SES API v2 (v1 is legacy) |
| API Gateway HTTP API v2 | CDK built-in | ~70% cheaper than REST API v1; CORS built-in |
| `zod` | 4.4.x | Lambda payload validation + shared schema with Angular Signal Forms |

**One stack note:** AWS SDK v3 is NOT pre-bundled on Node 22 Lambda. Never add `@aws-sdk/*` to `externalModules`.

### Non-Negotiable Requirements

See [FEATURES.md](./FEATURES.md) for full compliance notes.

**Must have (legal / functional blockers):**
- **Double opt-in** — GDPR lawful-basis for consent; SES sender reputation requirement
- **24h TTL on PENDING confirmation tokens** — DynamoDB TTL attribute; expired tokens → friendly error
- **`ConditionExpression` on confirm** — `attribute_exists(PK) AND confirmed = false` prevents replay attacks
- **GDPR hard-delete on unsubscribe** — `DeleteItem`, not `status = UNSUBSCRIBED`; consent timestamp stored at subscribe
- **`List-Unsubscribe` + `List-Unsubscribe-Post` headers** — RFC 8058 one-click unsubscribe (Gmail/Yahoo 2024 bulk sender requirement)
- **Two-step unsubscribe** — GET shows confirm page, POST performs deletion (prevents email client pre-fetch triggering unsubscribe)
- **SES suppression list enabled from day 1** — auto-suppresses bounces/complaints; prevents account suspension
- **SPF + Easy DKIM + DMARC** — one-time DNS setup, CDK-managed; must propagate before first send
- **Rate limiting on `/subscribe`** — API Gateway throttle (5 req/IP/min) + per-email cooldown in DynamoDB
- **Privacy notice** — linked from subscribe form and emails; required under GDPR/AVG

**Defer to v2:**
- Multi-township subscription UI (data model already supports it)
- Subscription expiry / re-confirmation prompts
- Email open/click tracking via SES Configuration Sets
- "Manage my subscription" magic-link flow

### Architecture Approach

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full diagrams, CDK code, and DynamoDB key design.

Three Lambda functions (not more, not fewer):

1. **`CheckerLambda`** — EventBridge scheduled (every 10 min); scrapes ACV per township; diffs against DynamoDB cache; sends notifications via SES; ARM64 / 256 MB / 5 min timeout
2. **`ApiLambda`** — API Gateway HTTP API v2; handles `POST /subscribe`, `GET /confirm`, `GET /unsubscribe` in a single function (simple `routeKey` switch); ARM64 / 128 MB / 10 s timeout
3. **No third Lambda for v1** — SES bounce/complaint handling via Configuration Set suppression is sufficient

DynamoDB single table, two CDK stacks:
- **`StatefulStack`** — DynamoDB `TableV2` (termination protection ON) + SES `EmailIdentity` + `ConfigurationSet`
- **`BackendStack`** — all Lambdas, API Gateway, EventBridge, S3 + CloudFront; receives table ARN from StatefulStack

DynamoDB key design: `PK=SUB#<email>`, `SK=TOWNSHIP#<id>` for subscribers; `PK=CACHE#<townshipId>`, `SK=DATE#<YYYY-MM-DD>` for availability cache. Two GSIs: GSI1 (confirmed subscribers by township), GSI2 (unsubscribe token lookup).

### Top 5 Risks

See [PITFALLS.md](./PITFALLS.md) for all 16 pitfalls with full mitigations.

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **SES sandbox blocks all non-verified sends** — subscriptions collect but no emails ever arrive | File SES production access request in Phase 1; specify transactional + double opt-in model |
| 2 | **Scraper silent failure overwrites cache with empty state** — real slots are missed indefinitely | Validate response with zod; treat `valid:false` or `days.length < 10` as hard failure; never write cache on scrape error; Lambda DLQ + CloudWatch alarm |
| 3 | **ACV site structural changes break scraper without warning** — no SLA, no public API | Schema-validate calendar response; log raw response on parse error; weekly "ran but sent 0 notifications" alarm |
| 4 | **SES bounce/complaint rate triggers account suspension** — affects all SES in the account | Enable suppression list (day 1); double opt-in reduces bounce rate; monitor SES reputation dashboard; alarm at bounce > 2% |
| 5 | **DKIM/domain DNS propagation blocks launch** — CDK deploy succeeds but emails fail | Plan DNS setup in Phase 1; poll verification status before marking infra ready; allow 72h buffer |

---

## Implications for Roadmap

### Phase 1: Infrastructure Foundation
**Rationale:** SES production access + DNS propagation are the long-pole items with external SLAs outside our control. Everything else blocks on email working. Must start here.
**Delivers:** CDK repo scaffolded; StatefulStack deployed (DynamoDB + SES identity); SES production access requested; domain DNS records (SPF, DKIM, DMARC) added; CDK bootstrap documented.
**Non-negotiables:** SES production access request filed; DKIM CNAME records added to DNS immediately after first `cdk deploy`.
**Research flag:** Standard CDK patterns — no additional research needed.

### Phase 2: Subscription API + Double Opt-In
**Rationale:** Core subscriber lifecycle must work end-to-end before the checker can notify anyone. Builds on Phase 1's SES + DynamoDB.
**Delivers:** `POST /subscribe` (validate, DDB write, SES confirmation email); `GET /confirm` (conditional write, GDPR consent timestamp); `GET /unsubscribe` (two-step, hard-delete); Angular subscribe form with Signal Forms + validation; Angular confirm/unsubscribe pages.
**Non-negotiables:** `ConditionExpression` on confirm; 24h TTL on PENDING tokens; two-step unsubscribe; hard-delete; `List-Unsubscribe-Post` header; rate limiting; privacy notice link.
**Research flag:** Well-documented patterns — no additional research needed.

### Phase 3: Availability Checker + Notifications
**Rationale:** Depends on confirmed subscribers in DynamoDB (Phase 2) and working SES sending (Phase 1). Migrates the existing scraper.
**Delivers:** `CheckerLambda` with per-township scrape loop; DynamoDB cache (replace `availability_cache.json`); SES notification email with slot details + unsubscribe link; EventBridge schedule; CloudWatch alarms for scrape failures.
**Non-negotiables:** Zod schema validation on ACV calendar response; never write cache on scrape failure; alarm on Lambda errors; `Promise.allSettled` per township (isolate failures).
**Research flag:** ACV session scraping fragility = MEDIUM confidence — validate scraper behavior in a real AWS environment early in this phase.

### Phase 4: Frontend Hosting + End-to-End
**Rationale:** Angular SPA can be developed locally throughout phases 2-3, but CloudFront deployment and custom domain wiring are the final integration step.
**Delivers:** S3 + CloudFront via `BackendStack`; custom domain with ACM certificate (us-east-1); `BucketDeployment` with `distributionPathsToInvalidate: ['/*']`; SPA routing (index.html fallback on 403/404); `ng build` → S3 deploy in CI.
**Non-negotiables:** ACM certificate in `us-east-1` (CloudFront requirement); cache headers: long TTL for hashed assets, `no-cache` for `index.html`.
**Research flag:** Standard patterns — no additional research needed.

### Phase Ordering Rationale

- Phase 1 must come first because SES production access has an **external approval SLA (24–72h)** and DNS propagation takes up to 72h — these cannot be parallelized with development.
- Phase 2 before Phase 3 because the checker needs confirmed subscribers to notify; building the API first also establishes the DynamoDB schema that Phase 3 reads.
- Phase 4 can overlap Phase 2/3 in development (Angular runs locally) but CDK deployment of CloudFront is the last integration step.

### Research Flags

| Phase | Research Needed | Reason |
|-------|----------------|--------|
| Phase 3 | **Yes — validate in AWS** | ACV session scraping behavior in Lambda environment (IP rotation, session binding latency) is MEDIUM confidence; needs a real deploy test early |
| Phases 1, 2, 4 | No | All CDK v2, Angular 21, SES v2 patterns are HIGH confidence with official docs |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry + Context7 official docs on 2025-06-12 |
| Features | HIGH | Core flows verified against official AWS SES docs and GDPR regulation text |
| Architecture | HIGH | All patterns verified against official AWS CDK v2 docs |
| Pitfalls | HIGH (SES/DDB), MEDIUM (scraping) | SES and GDPR pitfalls are well-documented; ACV scraping fragility is based on code analysis + general knowledge |

**Overall confidence:** HIGH — stack is confirmed, architecture is clear, risks are identified with specific mitigations.

### Gaps to Address

- **ACV scraping in Lambda environment:** The current scraper runs as a local CLI; Lambda's ephemeral environment (IP rotation, no persistent state) may affect session acquisition. Validate with a real Lambda deploy in Phase 3 before building notification fan-out.
- **Domain/DNS ownership:** DNS record setup requires access to the domain registrar. Confirm domain ownership and registrar access before Phase 1 begins.
- **SES production access approval:** The support request must include estimated volume and use-case description. Prepare this text before starting Phase 1.
- **Township list source:** The Angular form needs a township dropdown. Research confirms DynamoDB-backed or static JSON is sufficient, but the canonical list of ACV-serviced townships needs to be extracted from the existing scraper config or ACV website.

---

## Open Questions (Decisions Needed Before Planning)

| Question | Impact | Default if not answered |
|----------|--------|------------------------|
| What domain will send emails? (`noreply@?`) | Blocks SES identity setup + DNS records | Defer — can use email identity instead of domain identity to start |
| Is `cdk bootstrap` already done for the target AWS account? | Blocks first `cdk deploy` | Run `cdk bootstrap` as first task in Phase 1 |
| Should the checker run every 10 min (CDK default) or different cadence? | EventBridge schedule cost + ACV load | 10 min is a reasonable default; tune after launch |
| Hard-delete vs soft-delete on unsubscribe? | GDPR right to erasure; SES suppression list interaction | **Hard-delete** is recommended (GDPR Art. 17); SES suppression list handles the "never re-email" guarantee independently |

---

## Sources

### Primary (HIGH confidence)
- Angular 21 official docs (Context7: `/websites/angular_dev`) — signals, Signal Forms, control flow, httpResource
- AWS CDK v2 guide (Context7: `/awsdocs/aws-cdk-guide`) — TableV2, NodejsFunction, HTTP API v2, BucketDeployment
- AWS SES official docs — best practices, suppression list, subscription management, sandbox/production access
- `@aws-sdk/client-sesv2` v3 docs — SendEmailCommand, SESv2 API
- GDPR regulation text (gdpr-info.eu) — Art. 6 (lawful basis), Art. 17 (right to erasure)
- RFC 2369, RFC 8058 — List-Unsubscribe headers

### Secondary (MEDIUM confidence)
- ACV scraping fragility assessment — based on analysis of `src/check-availability.ts` + general knowledge of PHP session-based sites
- Lambda cold start durations (200–800ms) — community benchmarks; Lambda behavior well-documented

---
*Research completed: 2025-06-12*
*Ready for roadmap: yes*
