# Plan 01-04 Summary: BackendStack (Lambda + EventBridge + HTTP API)

**Phase:** 01-infrastructure-foundation  
**Plan:** 01-04  
**Completed:** 2026-05-26  
**Commit:** dedd621

## What Was Built

- **`infrastructure/lib/backend-stack.ts`** — full implementation replacing stub:
  - `CheckerLambda` (`NodejsFunction`): Node 22, ARM64, 256 MB, 5-min timeout, esbuild bundled
  - `ApiLambda` (`NodejsFunction`): Node 22, ARM64, 128 MB, 10-sec timeout, esbuild bundled
  - EventBridge `Rule` `CheckerSchedule`: `rate(10 minutes)` targeting CheckerLambda (ENABLED)
  - HTTP API v2 (`HttpApi`) with CORS preflight (acv-aanhanger.nl + localhost:4200)
  - Three routes: `POST /subscribe`, `GET /confirm`, `GET /unsubscribe`
  - `grantReadWriteData` on both Lambdas (least-privilege IAM via CDK)
  - CDK output: `ApiUrl`
  - `projectRoot` set to repo root so `backend/` entry paths resolve outside `infrastructure/`

## Verifications

| Check | Result |
|-------|--------|
| `cd infrastructure && npx tsc --noEmit` | ✅ exits 0 |
| `grep -c 'grantReadWriteData' lib/backend-stack.ts` | ✅ 2 (one per Lambda) |
| No `externalModules` excluding `@aws-sdk/*` | ✅ SDK bundled |
| `grep -c 'Schedule.rate' lib/backend-stack.ts` | ✅ 1 |
| `grep -c 'HttpApi' lib/backend-stack.ts` | ✅ 1 |
| `cdk synth --quiet` exits 0 for both stacks | ✅ |
| `cd infrastructure && npm test` | ✅ 6 todo, 0 failures |

## Deviations from Plan

**[Rule 1 - PathNotUnderRoot] NodejsFunction entry outside default projectRoot**  
Found during: Task 1 / cdk synth validation  
Issue: CDK enforces that `entry` path must be under `projectRoot` (defaults to `infrastructure/`); `backend/src/*/handler.ts` is outside  
Fix: Added `projectRoot: path.join(__dirname, '../..')` (repo root) and `depsLockFilePath` pointing to `backend/package-lock.json` on both `NodejsFunction` constructs  
Verification: `cdk synth --quiet` exits 0; Lambda bundles created successfully in test run

**Task 2 (cdk deploy AcvBackend) — SKIPPED**  
Reason: User opted for scaffold-only execution; no AWS credentials configured  
Impact: AcvBackend stack not yet deployed; API URL not available yet. Phase 3 Angular `environment.ts` should use the mock API until Phase 4 deployment.

**Total deviations:** 1 auto-fixed, 1 task skipped by user request  
**Impact:** Code is complete and deployable. Deploy when credentials available: `cd infrastructure && npx cdk deploy AcvBackend`.

## Next Steps for Deploy

When ready to deploy:
1. Configure AWS credentials (`aws configure` or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
2. `aws cloudformation describe-stacks --stack-name CDKToolkit --region eu-central-1` — check bootstrap
3. If not bootstrapped: `cd infrastructure && npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/eu-central-1`
4. `cd infrastructure && npx cdk deploy AcvStateful`
5. `cd infrastructure && npx cdk deploy AcvBackend`
6. Note the `ApiUrl` output and update Angular `environment.ts` with the real API URL

## Self-Check: PASSED
