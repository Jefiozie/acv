# Plan 01-01 Summary: CDK Monorepo Scaffold

**Phase:** 01-infrastructure-foundation  
**Plan:** 01-01  
**Completed:** 2026-05-26  
**Commit:** 09c0159

## What Was Built

- **Root `tsconfig.json`**: Updated as base config — removed `module`/`moduleResolution`/`include` (per-subproject), added `declaration: true`, `forceConsistentCasingInFileNames: true`
- **`.gitignore`**: Added CDK artifacts (`cdk.out/`, `cdk.context.json`, `.cdk.staging/`), `.env.local`, `*.pem`, `availability_cache.json`
- **`README.md`**: Added Infrastructure section with one-time CDK bootstrap flow and deploy commands
- **`infrastructure/`**: Full CDK scaffold — `bin/app.ts` wires `AcvStateful` + `AcvBackend` stacks, typed stub classes for both, `package.json` with all CDK devDeps, `cdk.json`, `vitest.config.ts`
- **`backend/`**: `@acv/backend` package with `NodejsFunction`-ready Lambda handler stubs for `CheckerLambda` and `ApiLambda`, plus runtime dependencies (`@aws-sdk/*`, `zod`)
- **`frontend/.gitkeep`**: Phase 3 placeholder confirmed
- **Vitest Wave 0 stubs**: 2 test files with `it.todo()` placeholders (6 todo, 0 failures)

## Verifications

| Check | Result |
|-------|--------|
| `cd infrastructure && npx tsc --noEmit` | ✅ exits 0 |
| `cd backend && npx tsc --noEmit` | ✅ exits 0 |
| `cd infrastructure && npx cdk synth` | ✅ exits 0 (AcvStateful + AcvBackend) |
| `infrastructure/tsconfig.json` extends `../tsconfig.json` | ✅ |
| `backend/tsconfig.json` extends `../tsconfig.json` | ✅ |
| `.gitignore` excludes `cdk.out/` | ✅ |
| `frontend/.gitkeep` exists | ✅ |
| No hardcoded AWS account ID | ✅ uses `CDK_DEFAULT_ACCOUNT` |
| `cd infrastructure && npm test` | ✅ exits 0 (6 todo) |

## Deviations from Plan

**[Rule 3 - Prerequisite Missing] AWS CLI not installed**  
Found during: Task 1  
Issue: `aws` command not found; CDK bootstrap check could not be executed  
Fix: User explicitly opted for scaffold-only execution (no AWS credentials); documented bootstrap flow in README for manual execution  
Impact: No code impact; bootstrap must be run manually before first `cdk deploy`

**[Rule 3 - Package Fix] `@aws-cdk/assertions` does not exist in CDK v2**  
Found during: Task 5  
Issue: CDK v2 bundles assertions inside `aws-cdk-lib/assertions` — there is no separate `@aws-cdk/assertions@^2` package  
Fix: Removed `@aws-cdk/assertions` from `devDependencies`; test files import from `aws-cdk-lib/assertions`  
Files: `infrastructure/package.json`, test files  
Verification: `npm install` succeeds, `npm test` passes

**[Rule 1 - Empty suites] Vitest rejects empty `describe` blocks**  
Found during: Task 5  
Issue: Vitest 4.x fails suites with zero tests inside a `describe` block  
Fix: Added `it.todo(...)` placeholders inside each `describe` block  
Files: `infrastructure/test/stateful-stack.test.ts`, `infrastructure/test/backend-stack.test.ts`  
Verification: `npm test` exits 0

**Total deviations:** 3 auto-fixed  
**Impact:** No architectural changes; all plan goals achieved locally. AWS-dependent steps (bootstrap, deploy) deferred to user.

## Self-Check: PASSED
