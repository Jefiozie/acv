# ACV Aanhanger Beschikbaarheid

## What This Is

A public Angular web app where anyone can subscribe with their email and choose a township to receive email notifications whenever new ACV Groep trailer rental slots open up in the next 14 days. The existing TypeScript availability checker becomes the core engine, running as a scheduled AWS Lambda function, with DynamoDB storing subscribers and Amazon SES delivering emails.

## Core Value

Subscribers get notified the moment a new trailer slot appears — without having to manually check the ACV website.

## Requirements

### Validated

- ✓ ACV Groep calendar API integration (session auth via PHPSESSID + visitor_id cookies) — existing
- ✓ Township-filtered availability fetch (per-location calendar requests) — existing
- ✓ 14-day lookahead window for upcoming slot detection — existing
- ✓ Diff-based new-slot detection (compare current state vs previous run) — existing
- ✓ Outbound notification on new slot discovery — existing (currently Telegram)

### Active

- [ ] Angular web app — public subscription UI (email + township picker)
- [ ] Subscription confirmation email via Amazon SES
- [ ] Unsubscribe link in all notification emails
- [ ] AWS Lambda scheduled checker (replaces/extends cron script)
- [ ] AWS Lambda subscription API (subscribe/unsubscribe endpoints)
- [ ] DynamoDB subscriber store (email + township + confirmed status)
- [ ] Email notifications via Amazon SES when new slots detected
- [ ] Per-subscriber notification frequency: immediately (every checker run) or daily digest
- [ ] Per-township checker: run availability check for each unique subscribed township
- [ ] AWS CDK infrastructure (all resources defined as code)

### Out of Scope

- Telegram notifications — replaced by email for the public app
- User dashboard (manage subscriptions) — v1 is subscribe + unsubscribe only
- Admin panel (view all subscribers, trigger manual checks) — post-v1
- Specific date or time-slot targeting — subscribers get notified about any slot in 14 days
- Authentication / login — no accounts, email-based unsubscribe only

## Context

- Existing codebase: single TypeScript file (`src/check-availability.ts`) — procedural CLI, no framework
- The ACV calendar API is cookie-based (no public API key); session must be scraped per run
- Township is currently a single env var; the new system must support multiple townships (one per subscriber group)
- The availability cache will move from a local JSON file to DynamoDB (keyed per township)
- Angular app is the only UI — no SSR needed for v1
- CDK stack will live in this same repo (monorepo: `frontend/`, `backend/`, `infrastructure/`)

## Constraints

- **Tech Stack**: Angular 21+ (frontend), AWS CDK + Lambda (backend/infra), DynamoDB (data), Amazon SES (email) — chosen
- **Hosting**: AWS — all infra must be deployable via `cdk deploy`
- **Email delivery**: SES requires domain/email verification before sending; must be handled in setup
- **ACV API**: No official API — scraping-based session acquisition; fragile if ACV changes their site
- **Monorepo**: All code lives in this repo; existing `src/` stays as reference/migration source

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Angular 21+ for frontend | User specified; modern signals-based reactivity, latest Angular features | — Pending |
| AWS CDK + Lambda | User specified — serverless, no server management | — Pending |
| DynamoDB for subscribers | Pairs naturally with Lambda, serverless, low ops overhead | — Pending |
| Amazon SES for email | Native AWS, cheapest, CDK native support | — Pending |
| Subscribe-only v1 (no dashboard) | Keep scope tight for first release | — Pending |
| Per-township availability cache in DynamoDB | Multiple townships now needed; file-based cache won't scale | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-25 after initialization*
