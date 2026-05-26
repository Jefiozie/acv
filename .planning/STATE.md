---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-26T07:50:00.000Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 6
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Subscribers get notified the moment a new trailer slot appears — without having to manually check the ACV website.
**Current focus:** Phase 1 scaffold complete — AWS deploy pending credentials

## Current Status

**Phase:** Phase 1 scaffold done (deploy deferred), Phase 3 complete
**Stage:** Infrastructure code ready; deploy when AWS credentials available

## Phases

| # | Title | Status |
|---|-------|--------|
| 1 | Infrastructure Foundation | 🟡 Scaffold done — deploy pending |
| 2 | Backend API + Checker + Notifications | 🔲 Not started |
| 3 | Angular SPA | ✅ Complete (2026-05-25) |
| 4 | Frontend Hosting + Production Hardening | 🔲 Not started |

## Phase 1 Scaffold Summary

**Completed:** 2026-05-26 (scaffold-only; no AWS credentials)
**Plans completed (code):** 01-01, 01-02, 01-04
**Plans deferred (requires AWS/DNS):** 01-03 (SES DNS + production access request)

**What was scaffolded:**
- CDK monorepo: `infrastructure/`, `backend/`, `frontend/` directory structure
- `StatefulStack`: DynamoDB TableV2 (GSI1 + GSI2, RETAIN policy) + SES identity + ConfigSet
- `BackendStack`: CheckerLambda + ApiLambda (Node22, ARM64, esbuild) + EventBridge Rule + HTTP API v2
- `cdk synth` passes for both stacks locally
- Vitest Wave 0 stubs (6 todo tests)

**To deploy:**
1. Configure AWS credentials
2. `cd infrastructure && npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/eu-central-1` (if needed)
3. `cd infrastructure && npx cdk deploy AcvStateful`
4. `cd infrastructure && npx cdk deploy AcvBackend`

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

- ⚠️ **AWS credentials** — must be configured to deploy Phase 1 stacks
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
- `projectRoot` set to repo root in `NodejsFunction` so backend entry paths resolve correctly

---
*Initialized: 2026-05-25*
*Phase 3 completed: 2026-05-25*
*Phase 1 scaffold completed: 2026-05-26*

