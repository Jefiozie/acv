# Phase 1: Infrastructure Foundation — Research

**Researched:** 2026-05-25
**Domain:** AWS CDK v2 — DynamoDB, SES, EventBridge, API Gateway HTTP v2, monorepo TypeScript
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | AWS CDK v2 stack defines all infrastructure as code (DynamoDB, Lambda, SES, EventBridge) | CDK v2 `aws-cdk-lib` 2.257.0 verified — all constructs available in one package |
| INFRA-02 | `StatefulStack` contains DynamoDB table + SES identity (termination protection enabled) | `TableV2` + `EmailIdentity` + `ConfigurationSet` CDK pattern verified |
| INFRA-03 | `BackendStack` contains Lambda functions, API Gateway (HTTP API v2), EventBridge cron rule | `NodejsFunction` + `HttpApi` + `events.Rule` CDK pattern verified |
| INFRA-04 | SES sending identity verified with DKIM/SPF DNS records | `EmailIdentity` outputs DKIM CNAMEs; SPF/DMARC are manual TXT records |
| INFRA-05 | SES account-level suppression list enabled | `ConfigurationSet` with `suppressionReasons: SuppressionReasons.BOUNCES_AND_COMPLAINTS` |
| INFRA-06 | SES production access request filed | Manual AWS Support case — must be filed in 01-03 |
| INFRA-07 | DynamoDB single table with GSI1 (confirmed subscribers per township) and GSI2 (subscriber by unsubscribe token) | `TableV2` with `globalSecondaryIndexes` — full PK/SK/GSI design documented below |
| CHK-02 | Lambda triggered by EventBridge cron rule (every 10 minutes) | `events.Rule` with `Schedule.rate(Duration.minutes(10))` targeting placeholder Lambda |
</phase_requirements>

---

## Summary

Phase 1 scaffolds the CDK monorepo and deploys the stateful AWS infrastructure that everything else depends on. The work splits into four sequential tasks: (1) monorepo directory structure and CDK app init; (2) `StatefulStack` with DynamoDB + SES; (3) DNS records at the registrar + SES production access request; (4) `BackendStack` skeleton with placeholder Lambda stubs, EventBridge cron rule, and HTTP API.

The entire phase is about getting external approval timers running. SES production access has a 24–72 h approval SLA. DKIM/SPF DNS records take up to 72 h to propagate. Both of these block Phase 2's email sending and cannot be parallelised with development. The `cdk synth` / `cdk deploy` steps must succeed before the DNS tasks can start, because CDK generates the DKIM CNAME values on first deploy.

The existing `src/check-availability.ts` stays untouched as a reference implementation. Phase 1 does not migrate any business logic — just CDK scaffolding with placeholder Lambda handlers that export a stub `handler` function.

**Primary recommendation:** Deploy `StatefulStack` first, extract DKIM CNAME values from CDK output, add all DNS records immediately, then file the SES production access request — in that exact order, all in plan 01-03.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DynamoDB table + GSIs | AWS / CDK (StatefulStack) | — | Stateful resource; termination protection ON; RETAIN removal policy |
| SES identity + config set | AWS / CDK (StatefulStack) | — | Co-located with DynamoDB in StatefulStack (both stateful) |
| Placeholder Lambda stubs | AWS / CDK (BackendStack) | — | Stateless compute; deployed/replaced freely |
| EventBridge cron rule | AWS / CDK (BackendStack) | — | Stateless scheduler; targets placeholder Lambda |
| HTTP API Gateway | AWS / CDK (BackendStack) | — | Stateless API layer; receives StatefulStack outputs as props |
| DNS records (SPF/DKIM/DMARC) | Domain Registrar | — | Manual one-time step; outside CDK; triggered by DKIM output from CDK deploy |
| SES production access | AWS Support | — | Manual support request; must include double opt-in description |

---

## Standard Stack

### Core (CDK Infrastructure)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `aws-cdk-lib` | 2.257.0 | All CDK constructs (DynamoDB, SES, Lambda, API GW, EventBridge) | CDK v2 single-package design; one import instead of dozens of `@aws-cdk/*` packages |
| `constructs` | 10.6.0 | CDK base Construct class | Peer dependency of `aws-cdk-lib`; version must be pinned to match |
| `aws-cdk` (CLI) | 2.1033.0 (installed) / 2.1124.1 (latest) | `cdk deploy`, `cdk synth`, `cdk diff`, `cdk bootstrap` | CLI and library version are now independent tracks; installed 2.1033.0 is compatible with lib 2.257.0 |
| `esbuild` | 0.28.0 | `NodejsFunction` bundling at synth time | `NodejsFunction` requires `esbuild` as a local dev dep to bundle TypeScript Lambda code |
| `typescript` | 5.8.x (keep root; do NOT upgrade to 6.0 for infra) | TypeScript compiler for CDK and backend | CDK compatibility with TS 6.0 is unverified; project root is pinned to `^5.8.0` — keep that |
| `@types/aws-lambda` | 8.10.161 | Lambda handler type definitions | Type-safe `APIGatewayProxyEventV2`, `ScheduledEvent`, `Context` |
| `@types/node` | 22.x | Node.js built-in types | Lambda runs Node.js 22; must match runtime version |

### Supporting (Lambda Runtime)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@aws-sdk/client-dynamodb` | 3.1053.0 | DynamoDB base client | Needed in Lambda; do NOT add to `externalModules` — always bundle |
| `@aws-sdk/lib-dynamodb` | 3.1053.0 | DynamoDB Document client (marshalling) | `DynamoDBDocumentClient` + `PutCommand`, `QueryCommand` etc. |
| `@aws-sdk/client-sesv2` | 3.1053.0 | SES v2 API client | Phase 1 placeholder does not call SES but declare it ready for Phase 2 |
| `zod` | 4.4.3 | Input validation | Declare as runtime dep in backend; used in Phase 2 Lambda handlers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `TableV2` | `Table` (legacy) | `Table` is the old CDK construct; CDK docs explicitly call `TableV2` the "preferred construct" |
| HTTP API v2 (`aws-apigatewayv2`) | REST API v1 (`aws-apigateway`) | REST API is ~3.5× more expensive; HTTP API v2 has native CORS; sufficient for 3 routes |
| `NodejsFunction` with esbuild | Separate `tsc` + zip | `NodejsFunction` handles bundling at CDK synth time; zero extra build steps |
| `Identity.domain()` | `Identity.email()` | Domain identity covers ALL addresses on the domain; DKIM signs all outbound mail; email identity only covers one specific address |
| `events.Rule` (EventBridge classic) | EventBridge Scheduler | `events.Rule` is simpler CDK API for periodic rate schedules; Scheduler is better for one-off at-time jobs |

**Installation (infrastructure/):**
```bash
npm install --save-dev \
  aws-cdk-lib@2.257.0 \
  constructs@10.6.0 \
  esbuild \
  typescript \
  @types/aws-lambda \
  @types/node \
  ts-node
```

**Installation (backend/ — Lambda runtime deps):**
```bash
npm install \
  @aws-sdk/client-dynamodb \
  @aws-sdk/lib-dynamodb \
  @aws-sdk/client-sesv2 \
  zod
npm install --save-dev \
  @types/aws-lambda \
  @types/node \
  typescript
```

**Version verification:** All versions confirmed against npm registry on 2026-05-25. [VERIFIED: npm registry]

---

## Package Legitimacy Audit

> slopcheck was not available at research time — all packages tagged [ASSUMED] below. Planner must gate each install behind `checkpoint:human-verify` if installing new packages not already in node_modules.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `aws-cdk-lib` | npm | 3+ yrs | Very high | github.com/aws/aws-cdk | [ASSUMED OK] | Approved — official AWS CDK library |
| `constructs` | npm | 3+ yrs | Very high | github.com/aws/constructs | [ASSUMED OK] | Approved — official AWS CDK peer dep |
| `aws-cdk` (CLI) | npm | 3+ yrs | Very high | github.com/aws/aws-cdk | [ASSUMED OK] | Approved — official AWS CDK CLI |
| `esbuild` | npm | 5+ yrs | Very high | github.com/evanw/esbuild | [ASSUMED OK] | Approved — well-known bundler; postinstall downloads binary (normal behavior for this package) |
| `@aws-sdk/client-dynamodb` | npm | 3+ yrs | Very high | github.com/aws/aws-sdk-js-v3 | [ASSUMED OK] | Approved — official AWS SDK v3 |
| `@aws-sdk/lib-dynamodb` | npm | 3+ yrs | Very high | github.com/aws/aws-sdk-js-v3 | [ASSUMED OK] | Approved — official AWS SDK v3 |
| `@aws-sdk/client-sesv2` | npm | 3+ yrs | Very high | github.com/aws/aws-sdk-js-v3 | [ASSUMED OK] | Approved — official AWS SDK v3 |
| `zod` | npm | 4+ yrs | Very high | github.com/colinhacks/zod | [ASSUMED OK] | Approved — major validation library |
| `typescript` | npm | 10+ yrs | Very high | github.com/microsoft/TypeScript | [ASSUMED OK] | Approved — official Microsoft TypeScript |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none (all packages are well-known, long-established)

*slopcheck unavailable at research time — packages marked [ASSUMED]. Planner should add `checkpoint:human-verify` before install tasks if this is the first time installing into the repo.*

---

## Architecture Patterns

### System Architecture Diagram

```
Developer workstation
  │
  ├─ cdk bootstrap (one-time)
  │     └─ Creates CDKToolkit stack in AWS account/region
  │
  ├─ cdk deploy StatefulStack
  │     └─ Creates:
  │           DynamoDB TableV2 (PK, SK, GSI1, GSI2)
  │           SES EmailIdentity (noreply@acv-aanhanger.nl)
  │           SES ConfigurationSet (suppression: bounces+complaints)
  │     └─ Outputs: TABLE_ARN, TABLE_NAME, CONFIG_SET_NAME, DKIM_CNAME_1..3
  │
  ├─ DNS registrar (manual)
  │     └─ Add: DKIM CNAME × 3 (from CDK output)
  │     └─ Add: SPF TXT record
  │     └─ Add: DMARC TXT record
  │
  ├─ AWS Support (manual)
  │     └─ File: SES production access request
  │
  └─ cdk deploy BackendStack
        └─ Creates:
              CheckerLambda (placeholder handler)
              ApiLambda (placeholder handler)
              EventBridge Rule → CheckerLambda (rate: 10 min)
              HTTP API Gateway (CORS configured, 3 routes wired)
        └─ Receives: TABLE_ARN, TABLE_NAME from StatefulStack props
```

### Recommended Project Structure

```
/ (repo root)
├── src/                          # existing — stays as reference (do NOT delete)
│   └── check-availability.ts
├── frontend/                     # Phase 3 Angular SPA (empty in Phase 1)
├── backend/                      # Lambda TypeScript handlers
│   ├── src/
│   │   ├── checker/
│   │   │   └── handler.ts        # Phase 1: placeholder stub
│   │   └── api/
│   │       └── handler.ts        # Phase 1: placeholder stub
│   ├── package.json              # runtime deps: @aws-sdk/*, zod
│   └── tsconfig.json             # extends ../tsconfig.json; module: CommonJS
├── infrastructure/               # CDK app
│   ├── bin/
│   │   └── app.ts                # CDK App entry point
│   ├── lib/
│   │   ├── stateful-stack.ts     # DynamoDB + SES
│   │   └── backend-stack.ts      # Lambdas + API GW + EventBridge
│   ├── package.json              # dev deps: aws-cdk-lib, constructs, esbuild, typescript
│   └── tsconfig.json             # extends ../tsconfig.json; CDK-specific settings
├── tsconfig.json                 # root base config (strict, ES2022)
├── package.json                  # root: existing tsx script + dev tooling
├── cdk.json                      # CDK app config (in infrastructure/)
└── README.md                     # cdk bootstrap + deploy instructions
```

> **Note on `cdk.json` location:** The CDK app (`bin/app.ts`) and `cdk.json` live inside `infrastructure/`. Run `cdk` commands from the `infrastructure/` directory.

---

### Pattern 1: CDK App Entry + Stack Wiring

**What:** The CDK `App` in `bin/app.ts` instantiates both stacks, passing `StatefulStack` outputs to `BackendStack` as typed props.

**When to use:** Always. Cross-stack wiring via constructor props (not `Fn.importValue`) is the correct CDK pattern. CDK handles CloudFormation export/import automatically.

```typescript
// infrastructure/bin/app.ts
// Source: https://github.com/awsdocs/aws-cdk-guide [VERIFIED: official AWS CDK docs]
import * as cdk from 'aws-cdk-lib';
import { StatefulStack } from '../lib/stateful-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
};

const stateful = new StatefulStack(app, 'AcvStateful', {
  env,
  terminationProtection: true,   // ← CDK sets DeletionPolicy on the stack itself
});

const backend = new BackendStack(app, 'AcvBackend', {
  env,
  table: stateful.table,                   // passes the actual TableV2 construct
  sesConfigSetName: stateful.configSetName, // string output from StatefulStack
  sesFromAddress: 'noreply@acv-aanhanger.nl',
});
```

**Key rule:** Pass CDK construct objects (not ARN strings) between stacks when in the same CDK App. CDK resolves references to CloudFormation `!ImportValue`/`!GetAtt` automatically. [VERIFIED: official AWS CDK docs]

---

### Pattern 2: StatefulStack — TableV2 + SES

**What:** The complete `StatefulStack` definition with DynamoDB TableV2, GSI1, GSI2, SES EmailIdentity, and ConfigurationSet.

```typescript
// infrastructure/lib/stateful-stack.ts
// Source: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-dynamodb/README.md
//         https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-ses/README.md
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

export interface StatefulStackProps extends cdk.StackProps {}

export class StatefulStack extends cdk.Stack {
  public readonly table: dynamodb.TableV2;
  public readonly configSetName: string;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);

    // DynamoDB — single table, two entity types (SUB# and CACHE#)
    this.table = new dynamodb.TableV2(this, 'SubscriptionsTable', {
      tableName: undefined,                    // CDK-generated name — never hardcode
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),    // scales to zero, no capacity planning
      pointInTimeRecovery: true,               // PITR on [ASSUMED: prop name for TableV2]
      removalPolicy: cdk.RemovalPolicy.RETAIN, // CRITICAL: never destroy subscriber data
      // NOTE: termination protection on the stack itself (see bin/app.ts)
    });

    // GSI1 — query all confirmed subscribers for a township
    // Sparse GSI: only populated when confirmed=true (see Phase 2 confirm handler)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING }, // TOWNSHIP#<id>
      sortKey:      { name: 'GSI1SK', type: dynamodb.AttributeType.STRING }, // CONFIRMED#<email>
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['confirmed', 'frequency'],
    });

    // GSI2 — look up subscriber by unsubscribe token (one-click unsubscribe)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING }, // TOKEN#<uuid>
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,  // only need PK+SK to delete
    });

    // SES EmailIdentity — domain identity (preferred over email identity)
    const emailIdentity = new ses.EmailIdentity(this, 'SenderIdentity', {
      identity: ses.Identity.domain('acv-aanhanger.nl'),
      // CDK outputs 3 DKIM CNAME records to add to DNS
    });

    // SES ConfigurationSet — account-level suppression, reputation metrics
    const configSet = new ses.ConfigurationSet(this, 'SesConfigSet', {
      configurationSetName: 'AcvNotifications',
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      reputationMetrics: true,
      sendingEnabled: true,
    });
    this.configSetName = configSet.configurationSetName!;

    // CDK outputs — capture DKIM values for DNS setup
    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
    new cdk.CfnOutput(this, 'TableArn',  { value: this.table.tableArn  });
    new cdk.CfnOutput(this, 'ConfigSetName', { value: this.configSetName });
    // DKIM CNAMEs are shown in SES console after deploy — not exposed as CDK outputs
    // Use: aws sesv2 get-email-identity --email-identity acv-aanhanger.nl | jq '.DkimAttributes'
  }
}
```

**⚠️ `pointInTimeRecovery` prop name:** STACK.md uses `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }` while ARCHITECTURE.md uses `pointInTimeRecovery: true`. These reflect two different CDK versions. **Recommendation:** Try `pointInTimeRecovery: true` first (simple boolean); if TypeScript rejects it, use `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }`. Check CDK generated types at compile time. [ASSUMED — verify against CDK 2.257.0 TypeScript types]

---

### Pattern 3: BackendStack Skeleton — NodejsFunction + EventBridge + HttpApi

```typescript
// infrastructure/lib/backend-stack.ts
// Source: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda-nodejs/README.md
//         https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-apigatewayv2/README.md
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.TableV2;
  sesConfigSetName: string;
  sesFromAddress: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);
    const { table, sesConfigSetName, sesFromAddress } = props;

    // CheckerLambda — placeholder in Phase 1; real logic in Phase 2
    const checkerFn = new lambdaNode.NodejsFunction(this, 'CheckerFunction', {
      entry: '../backend/src/checker/handler.ts',  // relative to infrastructure/
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        // DO NOT add externalModules: ['@aws-sdk/*'] — bundle the SDK for version consistency
        // See: STACK.md note — SDK v3 is included in Node 22 runtime but is an old version
      },
      environment: {
        TABLE_NAME: table.tableName,        // never hardcode; always pass via env var
        SES_FROM_ADDRESS: sesFromAddress,
        SES_CONFIG_SET: sesConfigSetName,
      },
    });

    // Grant Lambda read/write access to DynamoDB (least-privilege)
    table.grantReadWriteData(checkerFn);

    // EventBridge Rule — every 10 minutes (CHK-02)
    new events.Rule(this, 'CheckerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [new targets.LambdaFunction(checkerFn)],
    });

    // ApiLambda — placeholder in Phase 1; real logic in Phase 2
    const apiFn = new lambdaNode.NodejsFunction(this, 'ApiFunction', {
      entry: '../backend/src/api/handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      bundling: { minify: true, target: 'node22' },
      environment: {
        TABLE_NAME: table.tableName,
        SES_FROM_ADDRESS: sesFromAddress,
        SES_CONFIG_SET: sesConfigSetName,
        FRONTEND_URL: 'https://acv-aanhanger.nl',
      },
    });

    table.grantReadWriteData(apiFn);

    // HTTP API v2 — CORS configured for frontend origin
    const httpApi = new apigatewayv2.HttpApi(this, 'AcvApi', {
      corsPreflight: {
        allowOrigins: ['https://acv-aanhanger.nl', 'http://localhost:4200'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const apiIntegration = new HttpLambdaIntegration('ApiIntegration', apiFn);

    httpApi.addRoutes({ path: '/subscribe',   methods: [apigatewayv2.HttpMethod.POST], integration: apiIntegration });
    httpApi.addRoutes({ path: '/confirm',     methods: [apigatewayv2.HttpMethod.GET],  integration: apiIntegration });
    httpApi.addRoutes({ path: '/unsubscribe', methods: [apigatewayv2.HttpMethod.GET],  integration: apiIntegration });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.url ?? '' });
  }
}
```

---

### Pattern 4: Placeholder Lambda Handlers

Phase 1 Lambda stubs — the minimum valid TypeScript to satisfy `NodejsFunction` at synth time.

```typescript
// backend/src/checker/handler.ts — Phase 1 placeholder
import { ScheduledEvent, Context } from 'aws-lambda';

export async function handler(event: ScheduledEvent, context: Context): Promise<void> {
  console.log('CheckerLambda placeholder — Phase 1', { event, context });
  // TODO Phase 2: implement ACV scrape + DynamoDB diff + SES notification
}
```

```typescript
// backend/src/api/handler.ts — Phase 1 placeholder
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> {
  console.log('ApiLambda placeholder — Phase 1', { routeKey: event.routeKey });
  return { statusCode: 501, body: JSON.stringify({ message: 'Not implemented yet' }) };
}
```

---

### Pattern 5: Monorepo tsconfig Chain

**Root tsconfig.json (shared base):**
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**infrastructure/tsconfig.json (CDK-specific):**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "cdk.out/ts",
    "rootDir": ".",
    "sourceMap": true,
    "esModuleInterop": true
  },
  "include": ["bin/**/*", "lib/**/*"],
  "exclude": ["node_modules", "cdk.out"]
}
```

**backend/tsconfig.json (Lambda code — type-checking only, esbuild handles compilation):**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

> **Note:** `noEmit: true` in backend `tsconfig.json` because `NodejsFunction` uses **esbuild** for actual compilation. The `tsconfig.json` in backend is for IDE type-checking only — `tsc` is not part of the Lambda build pipeline.

**frontend/tsconfig.json:** Let `ng new` generate this entirely. Angular CLI 21 produces its own tsconfig with `@angular` compiler options that are incompatible with extending a root config directly. Angular's generated tsconfig chain handles its own inheritance.

---

### Pattern 6: DynamoDB Single-Table Key Design

**Complete schema for this project:**

```
Entity          PK                      SK                          Extra Attributes
──────────────  ──────────────────────  ──────────────────────────  ─────────────────────────────────────────
Subscriber      SUB#<email>             TOWNSHIP#<townshipId>        confirmed (bool), frequency ('immediate'|'daily'),
                                                                     confirmToken (string, removed on confirm),
                                                                     unsubscribeToken (string),
                                                                     createdAt (ISO string),
                                                                     consentTimestamp (ISO string, added on confirm),
                                                                     ttl (number, epoch seconds — set on PENDING; removed on confirm)
                                                                     GSI1PK (TOWNSHIP#<id>), GSI1SK (CONFIRMED#<email>)  ← added on confirm
                                                                     GSI2PK (TOKEN#<unsubscribeToken>)                   ← set on create

Cache metadata  CACHE#<townshipId>      META                        lastChecked (ISO string)

Cache slot      CACHE#<townshipId>      DATE#<YYYY-MM-DD>           state ('available'|'semi'),
                                                                     slots (string[]),
                                                                     updatedAt (ISO string)
```

**GSI1 — "All confirmed subscribers for a township"**
- PK: `GSI1PK = TOWNSHIP#<townshipId>`
- SK: `GSI1SK = CONFIRMED#<email>`
- Sparse: these attributes are only written when subscriber is confirmed → GSI entry appears automatically on confirm
- Projection: `INCLUDE` → add `confirmed`, `frequency` (Phase 2 needs frequency for immediate vs. daily logic)

**GSI2 — "Subscriber by unsubscribe token"**
- PK: `GSI2PK = TOKEN#<unsubscribeToken>`
- Projection: `KEYS_ONLY` → Phase 2 gets PK+SK from this, then `DeleteItem` by main key
- Always populated at subscribe time (unsubscribe token is generated pre-confirmation)

**Access patterns the schema supports:**

| Operation | DynamoDB call | Key used |
|-----------|---------------|----------|
| Check duplicate subscribe | `GetItem` | PK=`SUB#email`, SK=`TOWNSHIP#id` |
| Create PENDING subscriber | `PutItem` + condition `attribute_not_exists(PK)` | main table |
| Confirm subscriber | `UpdateItem` SET confirmed, GSI1PK, GSI1SK, consentTimestamp REMOVE confirmToken | main table |
| Unsubscribe by token | `Query` GSI2 + `DeleteItem` | GSI2 → main table |
| List confirmed subs for township | `Query` GSI1 PK=`TOWNSHIP#id` | GSI1 |
| Read cache for township+date | `GetItem` | PK=`CACHE#id`, SK=`DATE#YYYY-MM-DD` |
| Write cache for township+date | `PutItem` | main table |

---

### Pattern 7: SES DNS Records

After `cdk deploy StatefulStack`, extract DKIM CNAMEs:
```bash
aws sesv2 get-email-identity \
  --email-identity acv-aanhanger.nl \
  --query 'DkimAttributes.Tokens' \
  --output text
# Returns three tokens; each maps to a CNAME record
```

**DNS records to add at registrar:**

```
# DKIM — three CNAME records (tokens from CDK/SES)
<token1>._domainkey.acv-aanhanger.nl  CNAME  <token1>.dkim.amazonses.com
<token2>._domainkey.acv-aanhanger.nl  CNAME  <token2>.dkim.amazonses.com
<token3>._domainkey.acv-aanhanger.nl  CNAME  <token3>.dkim.amazonses.com

# SPF — TXT record on the root domain (or on the MAIL FROM subdomain)
acv-aanhanger.nl  TXT  "v=spf1 include:amazonses.com ~all"

# DMARC — TXT record on the _dmarc subdomain
_dmarc.acv-aanhanger.nl  TXT  "v=DMARC1; p=none; rua=mailto:postmaster@acv-aanhanger.nl; sp=none; adkim=r; aspf=r"
```

> Start with `p=none` for DMARC (monitoring mode). After confirming all emails pass DKIM/SPF alignment, upgrade to `p=quarantine` or `p=reject`.

**Verification poll after adding DNS records:**
```bash
# Poll until VerificationStatus = SUCCESS (can take up to 72 hours)
aws sesv2 get-email-identity \
  --email-identity acv-aanhanger.nl \
  --query '{Verification: VerificationStatus, Dkim: DkimAttributes.Status}'
```

---

### Pattern 8: SES Production Access Request

SES production access is requested via the AWS Support Center. **What to write:**

- **Mail Type:** Transactional
- **Website URL:** `https://acv-aanhanger.nl` (or describe the app if not live yet)
- **Use case description:**
  ```
  We operate a public subscription service that notifies users when new
  trailer rental slots open at their selected ACV Groep location. Users
  subscribe via a web form with email + location. We use double opt-in:
  a confirmation email is sent immediately after subscription, and the
  subscription is only activated when the user clicks the confirmation
  link. Notification emails are only sent to confirmed subscribers.
  Unsubscribe links are included in every email. We expect to send
  100–500 transactional emails per month initially.
  ```
- **Bounce/complaint handling:** Double opt-in reduces bounce rate. SES suppression list (auto-suppress bounces and complaints) is enabled from day one. Unsubscribe requests are honored immediately via hard-delete.
- **Comply with AWS email sending policies:** Yes

**How to file:**
1. AWS Console → Support Center → Create Case
2. Service: Simple Email Service (SES)
3. Category: Sending limits increase / Production access
4. Severity: Normal (no SLA urgency; 24–72 h is expected)

[ASSUMED — process verified by project research but the exact AWS Console UI may vary]

---

### Pattern 9: CDK Bootstrap

**Run once per AWS account/region before the first `cdk deploy`:**
```bash
cd infrastructure
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
# Example:
cdk bootstrap aws://123456789012/eu-west-1
```

**What bootstrap creates:**
- S3 bucket (`cdk-hnb659fds-assets-<account>-<region>`) — Lambda code assets, CloudFormation templates
- ECR repository — Docker image assets (not used in this project, but created anyway)
- IAM roles — `CloudFormationExecutionRole`, `DeploymentActionRole`, `FilePublishingRole`, `ImagePublishingRole`, `LookupRole`
- CloudFormation stack: `CDKToolkit`

**Verify bootstrap completed:**
```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus'
# Expected: "CREATE_COMPLETE" or "UPDATE_COMPLETE"
```

---

### Anti-Patterns to Avoid

- **`externalModules: ['@aws-sdk/*']` in NodejsFunction bundling:** The runtime SDK on Node 22 Lambda may be an older version. Always bundle the SDK explicitly for production Lambdas. Only externalize if you explicitly want the runtime version and accept version drift. [ASSUMED — based on STACK.md guidance]
- **Hardcoding table names or ARNs:** Always use `table.tableName` and `table.tableArn` from the CDK construct; never write `"AcvSubscriptions-prod"` as a string literal.
- **Using `Identity.email()` for SES:** Email identity only verifies one address; domain identity verifies all addresses under the domain and enables Easy DKIM for the whole domain.
- **Deploying before `cdk bootstrap`:** Produces obscure `Bucket not found` errors about the CDK asset bucket.
- **Using `NODEJS_LATEST` as Lambda runtime:** Lambda updates this silently; pin to `NODEJS_22_X` for reproducible deployments.
- **Setting `terminationProtection: true` only on DynamoDB:** Also set it on the `StatefulStack` itself (in `bin/app.ts`) — stack-level protection prevents `cdk destroy` from running on the stack.
- **Old `Table` construct instead of `TableV2`:** CDK v2 docs explicitly state `TableV2` is preferred. `Table` (legacy) cannot be upgraded in-place.
- **Not running `cdk synth` before `cdk deploy`:** `cdk deploy` runs synth implicitly, but running synth separately first helps catch TypeScript and CDK validation errors without deploying.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-stack DynamoDB ARN sharing | String SSM Parameter + manual import | CDK construct props between stacks | CDK handles CloudFormation export/import automatically; manual SSM adds drift risk |
| Lambda TypeScript compilation | `tsc` build step + zip + upload | `NodejsFunction` (esbuild via CDK) | `NodejsFunction` bundles, minifies, and produces the Lambda zip during `cdk synth`; zero extra build pipeline |
| EventBridge cron target permissions | Manual `aws:lambda:AddPermission` | `targets.LambdaFunction` CDK construct | CDK adds the necessary Lambda resource policy automatically |
| DynamoDB capacity planning | Manual `readCapacity`/`writeCapacity` tuning | `Billing.onDemand()` | On-demand billing scales to zero and eliminates capacity planning for v1 subscriber volumes |
| DKIM key generation + rotation | Custom key management | `Identity.domain()` with Easy DKIM (RSA-2048) | SES manages DKIM keys; CDK outputs the CNAME records; no key material to store |
| IAM Lambda execution role | Manual `aws:iam::Role` with inline policies | `table.grantReadWriteData(lambdaFn)` | CDK grant methods produce least-privilege IAM policies automatically |

**Key insight:** CDK constructs handle most IAM, permissions, and CloudFormation wiring automatically via the grant/addToResourcePolicy pattern. Rolling custom IAM policies for Lambda → DynamoDB access is a common CDK beginner mistake.

---

## Common Pitfalls

### Pitfall 1: CDK App Fails Because `esbuild` Is Not Installed

**What goes wrong:** `cdk synth` or `cdk deploy` throws `Cannot find module 'esbuild'` when a `NodejsFunction` construct is present but `esbuild` is not in `devDependencies`.

**Why it happens:** `NodejsFunction` calls esbuild programmatically at synth time. CDK does NOT install it automatically — it must be in the CDK project's `node_modules`.

**How to avoid:** Add `esbuild` to `infrastructure/package.json` as a `devDependency`. Version 0.28.0 or later. [VERIFIED: npm registry]

**Warning signs:** Error message includes `Cannot find module 'esbuild'` or `Your application tried to access esbuild, but esbuild is not installed`.

---

### Pitfall 2: `NodejsFunction` Cannot Find Lambda Entry Point

**What goes wrong:** CDK throws at synth time: `Cannot find entry file at ...` because the `entry` path in `NodejsFunction` is wrong.

**Why it happens:** `entry` is resolved relative to the CDK app's working directory (the directory containing `cdk.json`), not relative to the source file. If `cdk.json` is in `infrastructure/`, then `entry` must be `'../backend/src/checker/handler.ts'` not `'backend/src/checker/handler.ts'`.

**How to avoid:** Use `path.join(__dirname, '../../backend/src/checker/handler.ts')` instead of a relative string, or verify the relative path from the `infrastructure/` directory.

**Warning signs:** CDK synth exits with `Cannot find entry file` before any CloudFormation output is generated.

---

### Pitfall 3: Stack Termination Protection ≠ DynamoDB RETAIN

**What goes wrong:** Developer sets `removalPolicy: RemovalPolicy.RETAIN` on DynamoDB but does NOT set `terminationProtection: true` on the stack. Running `cdk destroy AcvStateful` pops a prompt, user hits Enter, DynamoDB is retained (correct) but the CloudFormation stack is deleted, making the table "orphaned" and unmanaged by CDK going forward.

**Why it happens:** `RemovalPolicy.RETAIN` on the DynamoDB resource only controls what CloudFormation does when the resource is deleted. Stack termination protection prevents `cdk destroy` from running at all.

**How to avoid:** Set BOTH:
- `terminationProtection: true` in `new StatefulStack(app, 'AcvStateful', { ..., terminationProtection: true })`
- `removalPolicy: cdk.RemovalPolicy.RETAIN` on the `TableV2` construct

**Warning signs:** `cdk destroy` runs without error → DynamoDB table stays but stack is gone → next `cdk deploy` attempts to CREATE a new table (different ARN, all subscriber data lost from Lambda's perspective).

---

### Pitfall 4: SES Sends Fail With "Email address not verified"

**What goes wrong:** Phase 2 Lambda sends a confirmation email, receives `MessageRejected: Email address not verified. The following identities failed the check in region EU-WEST-1` even though the SES identity was deployed via CDK.

**Why it happens:** DNS propagation for DKIM CNAMEs and domain verification TXT records takes up to 72 hours. CDK `deploy` succeeds immediately, but SES verifies the domain asynchronously via DNS. Sending before verification succeeds fails.

**How to avoid:** After deploying `StatefulStack`, immediately add DNS records. Poll verification status before declaring Phase 1 done:
```bash
aws sesv2 get-email-identity \
  --email-identity acv-aanhanger.nl \
  --query '{Verification: VerificationStatus, DkimStatus: DkimAttributes.Status}'
# Wait until both show "SUCCESS"
```

**Warning signs:** SES console shows identity as "Unverified" or "Pending" in the Verified Identities section.

---

### Pitfall 5: CDK Bootstrap Version Mismatch

**What goes wrong:** `cdk deploy` fails with `This CDK CLI is not compatible with the CDK library used by your application. Please upgrade the CLI, or downgrade the library.`

**Why it happens:** The CDK CLI version and `aws-cdk-lib` version have independent version tracks. The locally installed CDK CLI (2.1033.0) is older than the latest `aws-cdk-lib` (2.257.0). CDK performs a compatibility check and rejects mismatched versions if the gap is too large.

**How to avoid:** Update the CDK CLI to a version compatible with `aws-cdk-lib@2.257.0`:
```bash
npm install -g aws-cdk@latest
# or pin to a specific CLI version that matches the lib
```

**Warning signs:** Error message explicitly mentions CLI/library version mismatch. Note: the installed CDK CLI is 2.1033.0 vs library 2.257.0 — these use different versioning tracks; minor mismatches are usually fine, but check at deploy time.

---

### Pitfall 6: SES Domain Identity vs Email Identity — Wrong Choice

**What goes wrong:** Developer uses `Identity.email('noreply@acv-aanhanger.nl')` instead of `Identity.domain('acv-aanhanger.nl')`. This works, but:
- Only the exact address `noreply@acv-aanhanger.nl` is verified
- Cannot change the `from` address later without re-verifying
- DKIM signing applies only to that one address (fewer CNAME records)
- Domain identity is the SES best practice

**How to avoid:** Use `ses.Identity.domain('acv-aanhanger.nl')` in the `EmailIdentity` construct. The `noreply@acv-aanhanger.nl` from-address works without needing a separate email identity once the domain is verified.

---

## Code Examples

### Check DynamoDB Bootstrap + GSI From CLI (after deploy)
```bash
# Verify table exists with correct GSIs
aws dynamodb describe-table --table-name <TABLE_NAME> \
  --query '{TableStatus: Table.TableStatus, GSIs: Table.GlobalSecondaryIndexes[*].IndexName}'
# Expected: {"TableStatus": "ACTIVE", "GSIs": ["GSI1", "GSI2"]}
```

### Verify SES Identity Status
```bash
aws sesv2 get-email-identity --email-identity acv-aanhanger.nl \
  --query '{
    VerifiedForSending: VerifiedForSendingStatus,
    DkimStatus: DkimAttributes.Status,
    DkimTokens: DkimAttributes.Tokens
  }'
```

### Enable SES Account-Level Suppression (if not done via CDK ConfigurationSet)
```bash
# Account-level suppression is separate from ConfigurationSet suppression
aws sesv2 put-account-suppression-attributes \
  --suppressed-reasons BOUNCE COMPLAINT
```

### Run CDK Synth (validate before deploy)
```bash
cd infrastructure
npm run build  # tsc (optional; esbuild handles Lambda compilation)
cdk synth      # produces CloudFormation templates in cdk.out/
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@aws-cdk/aws-dynamodb` (CDK v1) | `aws-cdk-lib/aws-dynamodb` (CDK v2) | CDK v2 (2021) | Single package import; no version alignment between constructs |
| `Table` construct | `TableV2` construct | CDK v2.x (2023+) | `TableV2` supports DynamoDB global tables natively; preferred per AWS docs |
| `@aws-cdk/aws-apigateway` (REST API) | `aws-cdk-lib/aws-apigatewayv2` (HTTP API) | CDK v2 | HTTP API v2 is ~3.5× cheaper; native CORS; sufficient for simple REST |
| Manual Lambda zip + S3 upload | `NodejsFunction` with esbuild | CDK v2 | Zero-config TypeScript Lambda bundling; no separate build step |
| AWS SDK v2 (`aws-sdk`) | AWS SDK v3 (`@aws-sdk/client-*`) | 2020, Lambda default Node 18+ | Tree-shakeable; modular; v3 is the current default in Lambda runtimes |
| NODEJS_12/14/16 Lambda runtime | NODEJS_22_X | 2024+ | Node 22 is LTS; includes fetch built-in; NODEJS_LATEST is unstable for prod |

**Deprecated/outdated:**
- `@aws-cdk/aws-*` packages (CDK v1): Replaced by `aws-cdk-lib` single package in CDK v2
- `Table` construct: AWS docs say `TableV2` is preferred; `Table` still works but is legacy
- AWS SDK v2 (`aws-sdk`): Deprecated, not maintained; use `@aws-sdk/client-*` v3

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pointInTimeRecovery: true` (boolean) is the correct `TableV2` prop name | Pattern 2 | CDK TypeScript compile error; fix: use `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }` |
| A2 | CDK CLI 2.1033.0 is compatible with `aws-cdk-lib@2.257.0` | Common Pitfalls #5 | Deploy might fail with version mismatch; fix: upgrade CLI with `npm install -g aws-cdk@latest` |
| A3 | `externalModules: ['@aws-sdk/*']` should NOT be set for Node 22 Lambda production code | Pattern 3 / Pitfalls | Lambda uses older bundled SDK; fix: always bundle (no `externalModules` for SDK) |
| A4 | SES production access request can be filed via Support Center before domain is verified | Pattern 8 | Request might require verified identity first; in practice AWS accepts the request concurrently |
| A5 | Angular `tsconfig.json` should not extend the root `tsconfig.json` | Pattern 5 | Angular CLI 21 generates its own tsconfig chain; extending root may introduce incompatible options |
| A6 | `entry` path in `NodejsFunction` is relative to CDK `cdk.json` location | Pitfall 2 | Wrong path → synth error; fix: use `path.join(__dirname, ...)` for reliable resolution |

---

## Open Questions (RESOLVED)

### Resolutions (confirmed by developer, 2026-05-25)

1. **Domain ownership**: Developer does NOT own `acv-aanhanger.nl` yet. Use `Identity.email()` for a verified sender email address during development. Plan 01-03 updated accordingly. Migrate to domain identity before go-live.
2. **Target AWS region**: `eu-central-1` (Frankfurt). All CDK stacks deploy to this region. Note: ACM cert for CloudFront (Phase 4) must still be created in `us-east-1`.
3. **CDK bootstrap status**: Not bootstrapped. Plan 01-01 adds `cdk bootstrap` as Task 1 (before any synth or deploy).

1. **Domain ownership and registrar access**
   - What we know: The project sends from `noreply@acv-aanhanger.nl`
   - What's unclear: Does the developer own `acv-aanhanger.nl` and have registrar access to add DNS records?
   - Recommendation: Confirm before starting plan 01-03. If domain is not owned yet, use `Identity.email()` as a temporary workaround during development, then migrate to domain identity before go-live.

2. **Target AWS region**
   - What we know: Environment variable `CDK_DEFAULT_REGION` is used; `eu-west-1` is the default in example code
   - What's unclear: Is `eu-west-1` the intended production region, or should it be `eu-central-1` (Frankfurt) for lower latency to Dutch users?
   - Recommendation: Confirm region before `cdk bootstrap`. Changing region after SES identity is created requires re-verification of the domain.

3. **AWS account bootstrap status**
   - What we know: `cdk --version` is 2.1033.0 (installed globally)
   - What's unclear: Has `cdk bootstrap` been run for the target account/region?
   - Recommendation: Run `aws cloudformation describe-stacks --stack-name CDKToolkit` to check. If stack not found, run bootstrap as the first task in plan 01-01.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CDK CLI, Lambda runtime, npm | ✓ | v22.19.0 | — |
| npm | Package installation | ✓ | 11.7.0 | — |
| AWS CDK CLI (`cdk`) | Deploy, synth, bootstrap | ✓ | 2.1033.0 | Upgrade to latest: `npm i -g aws-cdk@latest` |
| AWS CLI (`aws`) | DNS verification polling, SES status checks | Unknown | — | Install if missing: `apt install awscli` or AWS docs |
| AWS credentials | `cdk deploy` | Unknown | — | Must configure before any deploy |
| `esbuild` | `NodejsFunction` bundling at synth | Not installed | — | Must add to `infrastructure/devDependencies` |
| Domain registrar access | DNS record setup (plan 01-03) | Unknown | — | If no access: use `Identity.email()` temporarily |

**Missing dependencies with no fallback:**
- AWS credentials — must be configured (`aws configure` or env vars `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`) before `cdk deploy`
- `esbuild` — must be installed in `infrastructure/node_modules` before `cdk synth` with `NodejsFunction`

**Missing dependencies with fallback:**
- Domain registrar access — can temporarily use `Identity.email()` for a verified test address; switch to domain identity before go-live
- CDK CLI version — upgrade if deploy fails with version mismatch

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | CDK Assertions (`aws-cdk-lib/assertions`) — built-in, no extra install |
| Config file | `infrastructure/jest.config.ts` (Wave 0 gap — must create) |
| Quick run command | `cd infrastructure && npm test` |
| Full suite command | `cd infrastructure && npm test -- --coverage` |

> Note: CDK Phase 1 has minimal unit-testable logic. Primary validation is `cdk synth` (CloudFormation template generation) + manual AWS Console verification post-deploy.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | CDK stacks synthesize without error | smoke | `cdk synth` (exits 0) | ❌ Wave 0 |
| INFRA-02 | StatefulStack contains DynamoDB + SES identity with termination protection | unit (CDK assertions) | `npm test -- StatefulStack` | ❌ Wave 0 |
| INFRA-03 | BackendStack contains Lambda + API GW + EventBridge | unit (CDK assertions) | `npm test -- BackendStack` | ❌ Wave 0 |
| INFRA-04 | SES domain identity uses `Identity.domain()` | unit (CDK assertions) | `npm test -- SES` | ❌ Wave 0 |
| INFRA-05 | ConfigurationSet has suppression for bounces+complaints | unit (CDK assertions) | `npm test -- ConfigSet` | ❌ Wave 0 |
| INFRA-06 | (Manual) SES production access ticket filed | manual-only | — | N/A |
| INFRA-07 | DynamoDB table has GSI1 and GSI2 | unit (CDK assertions) | `npm test -- DynamoDB` | ❌ Wave 0 |
| CHK-02 | EventBridge rule target is CheckerLambda, rate=10min | unit (CDK assertions) | `npm test -- EventBridge` | ❌ Wave 0 |

### CDK Assertions Pattern

```typescript
// infrastructure/test/stateful-stack.test.ts (Wave 0 — create in 01-01)
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StatefulStack } from '../lib/stateful-stack';

describe('StatefulStack', () => {
  const app = new cdk.App();
  const stack = new StatefulStack(app, 'TestStateful', {
    env: { account: '123456789', region: 'eu-west-1' }
  });
  const template = Template.fromStack(stack);

  it('creates a DynamoDB TableV2 with RETAIN removal policy', () => {
    template.hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Retain',
    });
  });

  it('has GSI1 and GSI2', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI1' },
        { IndexName: 'GSI2' },
      ],
    });
  });

  it('has SES EmailIdentity', () => {
    template.resourceCountIs('AWS::SES::EmailIdentity', 1);
  });
});
```

### Sampling Rate

- **Per task commit:** `cdk synth` (exits 0)
- **Per wave merge:** `cd infrastructure && npm test`
- **Phase gate:** `cdk synth` clean + `npm test` green + AWS Console manual verification of DynamoDB table and SES identity

### Wave 0 Gaps

- [ ] `infrastructure/test/stateful-stack.test.ts` — covers INFRA-02, INFRA-04, INFRA-05, INFRA-07
- [ ] `infrastructure/test/backend-stack.test.ts` — covers INFRA-03, CHK-02
- [ ] `infrastructure/jest.config.ts` — test runner config
- [ ] Jest + `ts-jest` in `infrastructure/package.json` devDependencies
- [ ] `infrastructure/package.json` test script: `"test": "jest"`

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` (from config.json)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | Yes | StatefulStack/BackendStack separation; termination protection; RETAIN policy |
| V2 Authentication | No | Phase 1 is infrastructure only; no user auth in CDK stacks |
| V3 Session Management | No | No sessions in Phase 1 |
| V4 Access Control | Yes | IAM least-privilege: `table.grantReadWriteData(lambdaFn)` only; no `AdministratorAccess` on Lambda roles |
| V5 Input Validation | No | No user input in Phase 1 |
| V6 Cryptography | Partial | SES DKIM (RSA-2048 managed by AWS); no custom crypto in Phase 1 |

### Known Threat Patterns for CDK IaC

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Overly broad Lambda IAM role (e.g., `dynamodb:*` on all tables) | Elevation of Privilege | Use CDK `grant*` methods (e.g., `table.grantReadWriteData`) which scope to the specific table ARN |
| CDK assets S3 bucket public access | Information Disclosure | CDK bootstrap creates private bucket by default; never change `BlockPublicAccess` on CDK asset bucket |
| Stack deletion deletes subscriber data | Tampering | `terminationProtection: true` on `StatefulStack` + `RemovalPolicy.RETAIN` on `TableV2` |
| SES identity used before DKIM verified | Spoofing | Poll verification status post-deploy; add DNS records immediately |
| SES account suspension from bounce rate | Denial of Service | `ConfigurationSet` with `SuppressionReasons.BOUNCES_AND_COMPLAINTS` from day 1 |

---

## Sources

### Primary (HIGH confidence)
- `aws-cdk-lib` 2.257.0 — npm registry verified [VERIFIED: npm registry]
- `constructs` 10.6.0 — npm registry verified [VERIFIED: npm registry]
- `esbuild` 0.28.0 — npm registry verified, official homepage github.com/evanw/esbuild [VERIFIED: npm registry]
- `@aws-sdk/*` 3.1053.0 — npm registry verified [VERIFIED: npm registry]
- `zod` 4.4.3 — npm registry verified [VERIFIED: npm registry]
- `typescript` 6.0.3 latest on npm (project uses ^5.8.0 — keep that) [VERIFIED: npm registry]
- Existing project research: `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` — HIGH confidence, researched 2025-06-12

### Secondary (MEDIUM confidence)
- AWS CDK docs: https://github.com/awsdocs/aws-cdk-guide — CDK v2 stack patterns, cross-stack references, termination protection
- AWS CDK `TableV2` README: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-dynamodb/README.md
- AWS CDK `NodejsFunction` README: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda-nodejs/README.md
- AWS CDK `aws-apigatewayv2` README: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-apigatewayv2/README.md
- AWS SES docs: https://docs.aws.amazon.com/ses/latest/dg/setting-up.html

### Tertiary (LOW confidence)
- `pointInTimeRecovery` vs `pointInTimeRecoverySpecification` prop naming discrepancy — conflicting internal research documents; marked [ASSUMED]; verify at CDK 2.257.0 TypeScript types

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified via npm registry
- CDK construct APIs: MEDIUM-HIGH — based on existing project research cross-referenced with official CDK README files; one open question on `pointInTimeRecovery` prop name
- DynamoDB schema: HIGH — fully designed in previous research, consistent across ARCHITECTURE.md
- SES DNS records: HIGH — standard well-known format (SPF/DKIM/DMARC are IETF standards)
- SES production access: MEDIUM — process is documented but AWS Console UI may vary; marked [ASSUMED]
- Bootstrap/monorepo patterns: HIGH — standard CDK patterns, verified in multiple official sources
- Pitfalls: HIGH — drawn from project-specific PITFALLS.md research

**Research date:** 2026-05-25
**Valid until:** 2026-07-25 (CDK releases frequently; re-verify versions before Phase 2 begins)
