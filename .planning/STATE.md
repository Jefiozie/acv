---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-25T20:08:00.000Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 4
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Subscribers get notified the moment a new trailer slot appears — without having to manually check the ACV website.
**Current focus:** Phase 4 — Frontend Hosting + Production Hardening

## Current Status

**Phase:** 3 of 4 complete
**Stage:** Phase 3 complete — Angular SPA production bundle ready for Phase 4 deployment

## Phases

| # | Title | Status |
|---|-------|--------|
| 1 | Infrastructure Foundation | 🔲 Not started |
| 2 | Backend API + Checker + Notifications | 🔲 Not started |
| 3 | Angular SPA | ✅ Complete (2026-05-25) |
| 4 | Frontend Hosting + Production Hardening | 🔲 Not started |

## Phase 3 Completion Summary

**Completed:** 2026-05-25
**Angular version:** 21.2.14
**Framework:** Standalone components + Signal Forms (no NgModules, no ReactiveFormsModule)
**Test suite:** 19 Vitest specs passing (4 test files)
**Production bundle:** `frontend/dist/acv-frontend/browser/` (6 JS chunks, lazy-loaded routes)
**WCAG:** Manual review passed; `lang="nl"` and `<title>ACV Aanhanger Beschikbaarheid</title>` confirmed in index.html; automated axe-cli audit skipped (ChromeDriver version mismatch in CI)

**What was built:**
- 4 routes: `/` (subscribe), `/bevestigen` (confirm), `/uitschrijven` (unsubscribe), `/privacy`
- Mock API interceptor active in dev mode (`useMockApi: true`) — passes through in production
- Production build verified: `useMockApi: true` NOT present in dist bundle

## Blocking Dependencies

- ⚠️ **SES production access** — must be requested in Phase 1; 24–72h AWS approval time. Blocks Phase 2 email sending to real addresses.
- ⚠️ **Sending domain DNS** — DKIM/SPF records must be added to registrar during Phase 1. Update `noreply@acv-aanhanger.nl` placeholder before go-live.

## Key Decisions

- Angular 21+ (signals, standalone, no NgModules)
- AWS CDK v2 — two stacks: `StatefulStack` (DynamoDB + SES) and `BackendStack`
- DynamoDB single-table design with GSI1 (confirmed subscribers per township) + GSI2 (by unsubscribe token)
- Hard-delete on unsubscribe (GDPR/AVG Art. 17)
- Per-subscriber notification frequency: immediately or daily digest
- ACM certificate for CloudFront must be created in `us-east-1` regardless of stack region
- Angular Signal Forms (`@angular/forms/signal-forms`) — not ReactiveFormsModule
- Mock interceptor uses module-level `Set<string>` for 409 simulation in dev

---
*Initialized: 2026-05-25*
*Phase 3 completed: 2026-05-25*
