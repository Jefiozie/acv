---
phase: 01
slug: infrastructure-foundation
date: 2026-05-25
---

# Validation Strategy: Phase 01 — Infrastructure Foundation

## Validation Architecture

**Approach**: CDK Assertions tests (`aws-cdk-lib/assertions`) that validate CloudFormation template structure at synth time (no live AWS account required). Plus post-deploy AWS CLI spot-checks for live resource verification.

## Wave 0 — Test Infrastructure Setup

These are created in plan 01-01 as stubs (no assertions yet). Filled in during 01-02 and 01-04.

| File | Purpose |
|------|---------|
| `infrastructure/vitest.config.ts` | vitest config, runs `test/**/*.test.ts` |
| `infrastructure/test/stateful-stack.test.ts` | CDK Assertions for DynamoDB + SES |
| `infrastructure/test/backend-stack.test.ts` | CDK Assertions for EventBridge + HttpApi |

## Dimension Coverage

| Requirement | Test Type | Test File | Assertion |
|-------------|-----------|-----------|-----------|
| INFRA-02: StatefulStack termination protection | CDK Assertions | `stateful-stack.test.ts` | `template.hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Retain' })` |
| INFRA-07: GSI1 exists (confirmed subscribers per township) | CDK Assertions | `stateful-stack.test.ts` | Template has GlobalSecondaryIndexes containing `GSI1PK` |
| INFRA-07: GSI2 exists (unsubscribe token lookup) | CDK Assertions | `stateful-stack.test.ts` | Template has GlobalSecondaryIndexes containing `GSI2PK` |
| INFRA-04/05: SES EmailIdentity + ConfigurationSet with suppression | CDK Assertions | `stateful-stack.test.ts` | `template.hasResourceProperties('AWS::SES::ConfigurationSet', ...)` |
| INFRA-03: BackendStack has two Lambda functions | CDK Assertions | `backend-stack.test.ts` | Template has 2x `AWS::Lambda::Function` with Node.js 22 runtime |
| CHK-02: EventBridge Rule every 10 minutes | CDK Assertions | `backend-stack.test.ts` | `template.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(10 minutes)' })` |
| INFRA-03: HTTP API exists | CDK Assertions | `backend-stack.test.ts` | `template.resourceCountIs('AWS::ApiGatewayV2::Api', 1)` |

## Post-Deploy Spot Checks (plan 01-02, 01-04)

```bash
# Verify DynamoDB table with GSI names
aws dynamodb describe-table --table-name <table-name> --region eu-central-1 \
  --query 'Table.GlobalSecondaryIndexes[].IndexName'

# Verify EventBridge rule is Enabled
aws events describe-rule --name <rule-name> --region eu-central-1 \
  --query 'State'

# Verify SES email identity verification status
aws sesv2 get-email-identity --email-identity <sender-email> --region eu-central-1 \
  --query 'VerificationStatus'
```

## Gaps Accepted for Phase 1

- SES production access: manually verified via AWS Support ticket (no automation possible)
- CDK bootstrap: one-time manual step, verified by `aws cloudformation describe-stacks --stack-name CDKToolkit`
- DNS records: deferred (no domain yet) — mitigated by email identity path
