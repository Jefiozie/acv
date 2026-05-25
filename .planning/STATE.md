---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-25T19:49:24.035Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 8
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Subscribers get notified the moment a new trailer slot appears — without having to manually check the ACV website.
**Current focus:** Phase 1 — Infrastructure Foundation

## Current Status

**Phase:** 1 of 4
**Stage:** Ready to plan

Run `/gsd-plan-phase 1` to begin.

## Phases

| # | Title | Status |
|---|-------|--------|
| 1 | Infrastructure Foundation | 🔲 Not started |
| 2 | Backend API + Checker + Notifications | 🔲 Not started |
| 3 | Angular SPA | 🔲 Not started |
| 4 | Frontend Hosting + Production Hardening | 🔲 Not started |

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

---
*Initialized: 2026-05-25*
