# Plan 01-02 Summary: StatefulStack (DynamoDB + SES)

**Phase:** 01-infrastructure-foundation  
**Plan:** 01-02  
**Completed:** 2026-05-26  
**Commit:** dedd621

## What Was Built

- **`infrastructure/lib/stateful-stack.ts`** — full implementation replacing stub:
  - `DynamoDB.TableV2` with on-demand billing, `pointInTimeRecoverySpecification`, `RemovalPolicy.RETAIN`
  - GSI1 (`GSI1PK`/`GSI1SK`, INCLUDE projection with `confirmed` + `frequency` non-key attributes)
  - GSI2 (`GSI2PK`, KEYS_ONLY projection)
  - `SES.EmailIdentity` for `acv-aanhanger.nl` domain (Easy DKIM auto-enabled)
  - `SES.ConfigurationSet` `AcvNotifications` with `BOUNCES_AND_COMPLAINTS` suppression + reputation metrics
  - CDK Outputs: `TableName`, `TableArn`, `ConfigSetName`

## Verifications

| Check | Result |
|-------|--------|
| `cd infrastructure && npx tsc --noEmit` | ✅ exits 0 |
| `grep -c 'TableV2' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `grep -c 'GSI1' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `grep -c 'GSI2' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `grep -c 'EmailIdentity' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `grep -c 'SuppressionReasons' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `grep -c 'RemovalPolicy.RETAIN' lib/stateful-stack.ts` | ✅ ≥ 1 |
| `cdk synth AcvStateful` CF template contains GSI1 + GSI2 | ✅ verified |
| `cd infrastructure && npm test` | ✅ 6 todo, 0 failures |

## Deviations from Plan

**[Rule 2 - Deprecated API] `pointInTimeRecovery` → `pointInTimeRecoverySpecification`**  
Found during: Task 1 / cdk synth validation  
Issue: `pointInTimeRecovery: true` is deprecated in aws-cdk-lib 2.257.0  
Fix: Switched to `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }` as the plan pre-noted as alternative  
Verification: tsc and cdk synth pass cleanly with no warnings on this field

**Task 2 (cdk deploy AcvStateful) — SKIPPED**  
Reason: User opted for scaffold-only execution; no AWS credentials configured  
Impact: AcvStateful stack not yet deployed to AWS; must be run manually when credentials available

**Total deviations:** 1 auto-fixed, 1 task skipped by user request  
**Impact:** Code is complete and deployable. AWS resources will be created on first `cdk deploy AcvStateful`.

## Self-Check: PASSED
