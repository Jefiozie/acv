# Architecture Patterns: ACV Aanhanger Availability Notifier

**Domain:** Serverless event-driven email notification service on AWS
**Researched:** 2026-05-25
**Overall confidence:** HIGH (all patterns verified against official AWS docs and CDK v2 docs)

---

## System Overview

```
                           ┌──────────────────────────────────────────────┐
                           │           AWS Cloud (CDK-managed)            │
                           │                                              │
  User Browser             │  ┌────────────────┐   ┌──────────────────┐  │
  ───────────              │  │  CloudFront    │   │  EventBridge     │  │
  Angular SPA  ──HTTPS───► │  │  Distribution  │   │  Scheduled Rule  │  │
  (S3-hosted)             │  └───────┬────────┘   └────────┬─────────┘  │
                           │         │ API calls            │ every N min │
                           │         ▼                      ▼             │
                           │  ┌────────────────┐   ┌──────────────────┐  │
                           │  │  API Gateway   │   │ Checker Lambda   │  │
                           │  │  HTTP API      │   │ (per township)   │  │
                           │  └───────┬────────┘   └────────┬─────────┘  │
                           │         │                      │             │
                           │         ▼                      ▼             │
                           │  ┌────────────────┐   ┌──────────────────┐  │
                           │  │  API Lambda    │   │    DynamoDB      │  │
                           │  │  subscribe /   │◄──►│  Single Table   │  │
                           │  │  unsubscribe   │   │                  │  │
                           │  └───────┬────────┘   └──────────────────┘  │
                           │         │                                    │
                           │         ▼                                    │
                           │  ┌────────────────┐                         │
                           │  │  Amazon SES    │                         │
                           │  │  (transact.    │ ◄── Checker Lambda      │
                           │  │   email)       │     (notification)      │
                           │  └────────────────┘                         │
                           └──────────────────────────────────────────────┘
```

---

## Lambda Function Boundaries

### Three Lambda functions. Not one, not five.

#### 1. `CheckerLambda` — Scheduled availability checker

**Trigger:** EventBridge Scheduler rule — `rate(10 minutes)` (or configurable)
**Purpose:** The core engine. Migrated from `src/check-availability.ts`.

**Responsibilities:**
- Query DynamoDB for all distinct confirmed townships (scan GSI or maintained set)
- For each township, run the ACV session → calendar fetch → diff loop
- Compare current availability to the per-township cache in DynamoDB
- If new slots found: batch-query confirmed subscribers for that township via GSI
- Send notification emails via SES `SendEmail` API
- Write updated cache back to DynamoDB

**Key design note — one invocation, all townships:**  
Fan-out with `Promise.all` across townships is fine for v1. If the number of subscribed townships grows large (> 20), consider EventBridge → SQS → one Lambda per township message (fan-out pattern). For v1, single Lambda handles all townships sequentially or in parallel via `Promise.allSettled`.

**Memory:** 256 MB — network I/O bound, not CPU bound.  
**Timeout:** 5 minutes (scraping + SES send per township; headroom for ACV slowness).  
**Runtime:** `nodejs22.x` on ARM64 (Graviton2) — 20% cheaper, same cold-start profile.

```typescript
// CDK definition (BackendStack)
const checkerFn = new NodejsFunction(this, 'CheckerFunction', {
  entry: 'backend/src/checker/handler.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  memorySize: 256,
  timeout: Duration.minutes(5),
  bundling: {
    minify: true,
    sourceMap: false,
    externalModules: ['@aws-sdk/*'],   // SDK v3 is in the runtime
  },
  environment: {
    TABLE_NAME: table.tableName,
    SES_FROM_ADDRESS: 'noreply@yourdomain.nl',
    LOOKAHEAD_DAYS: '14',
  },
});

new Rule(this, 'CheckerSchedule', {
  schedule: Schedule.rate(Duration.minutes(10)),
  targets: [new LambdaFunction(checkerFn)],
});
```

---

#### 2. `ApiLambda` — Subscribe / Confirm / Unsubscribe handler

**Trigger:** API Gateway HTTP API (v2)  
**Purpose:** Manages subscriber lifecycle.

**Routes handled (all in one Lambda — simple routing in code):**
- `POST /subscribe` — create unconfirmed subscriber, send double opt-in email
- `GET /confirm?token=<confirmToken>` — mark subscriber confirmed
- `GET /unsubscribe?token=<unsubscribeToken>` — delete subscriber

**Why one Lambda for all routes?**  
The API has 3 routes, all DynamoDB + SES. Splitting into 3 Lambdas adds CDK boilerplate with no benefit at this scale. A simple `switch` on `event.routeKey` is sufficient.

**Memory:** 128 MB.  
**Timeout:** 10 seconds (DynamoDB + SES; no scraping).  
**Runtime:** `nodejs22.x` on ARM64.

```typescript
const apiFn = new NodejsFunction(this, 'ApiFunction', {
  entry: 'backend/src/api/handler.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  memorySize: 128,
  timeout: Duration.seconds(10),
  bundling: { minify: true, externalModules: ['@aws-sdk/*'] },
  environment: {
    TABLE_NAME: table.tableName,
    SES_FROM_ADDRESS: 'noreply@yourdomain.nl',
    FRONTEND_URL: 'https://yourdomain.nl',  // for confirmation redirect
  },
});

const httpApi = new HttpApi(this, 'Api', {
  corsPreflight: {
    allowOrigins: ['https://yourdomain.nl'],
    allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
  },
});

httpApi.addRoutes({ path: '/subscribe',   methods: [HttpMethod.POST], integration: new HttpLambdaIntegration(...) });
httpApi.addRoutes({ path: '/confirm',     methods: [HttpMethod.GET],  integration: new HttpLambdaIntegration(...) });
httpApi.addRoutes({ path: '/unsubscribe', methods: [HttpMethod.GET],  integration: new HttpLambdaIntegration(...) });
```

**Why API Gateway HTTP API (v2) and not Function URLs?**  
- HTTP API v2 gives CORS configuration out-of-the-box as a CDK construct
- Supports custom domain names cleanly via CDK
- Marginally more ops overhead than Function URLs but negligible for 3 routes
- Do **not** use REST API (v1) — it's older, more expensive, and overkill here

---

#### 3. No third Lambda needed

**SES bounce/complaint handling** — SES Configuration Set can write bounce/complaint events to an SNS topic. If you need to auto-remove bouncing addresses, add a third Lambda later. V1 can skip this and handle manually.

---

## DynamoDB Table Design

### Single table. Two entity types. Three access patterns.

**Table name:** `AcvSubscriptions` (CDK-generated physical name — use `tableName` output)

```
PK                    SK                          Attributes
──────────────────    ──────────────────────────  ──────────────────────────────────────────
SUB#<email>           TOWNSHIP#<townshipId>        confirmed (bool), unsubscribeToken (string),
                                                   confirmToken (string), createdAt (ISO string)

CACHE#<townshipId>    META                         lastChecked (ISO string)
                                                   (lightweight metadata item)

CACHE#<townshipId>    DATE#<YYYY-MM-DD>            state ("available"|"semi"),
                                                   slots (string[]),
                                                   updatedAt (ISO string)
```

### Primary Key

| Key | Value | Type |
|-----|-------|------|
| PK | `SUB#jeffrey@example.com` | String |
| SK | `TOWNSHIP#16` | String |

- **One item per (email, township) pair** — a subscriber can watch multiple townships; each gets its own row
- PK prefix `SUB#` and `CACHE#` enable co-location of entity types in one table without collisions

### GSI1 — "All confirmed subscribers for a township"

| Attribute | Value |
|-----------|-------|
| GSI1PK | `TOWNSHIP#<townshipId>` |
| GSI1SK | `CONFIRMED#<email>` (only projected when `confirmed = true`) |

**Used by:** CheckerLambda to find all emails to notify when new slots appear for a township.

**Implementation:** Sparse GSI. Only write `GSI1PK` / `GSI1SK` attributes when subscriber is confirmed. When the user confirms, update the item to add those attributes — the GSI entry appears automatically.

```typescript
// CDK table definition
const table = new TableV2(this, 'SubscriptionsTable', {
  partitionKey: { name: 'PK', type: AttributeType.STRING },
  sortKey:      { name: 'SK', type: AttributeType.STRING },
  billing: Billing.onDemand(),
  globalSecondaryIndexes: [{
    indexName: 'GSI1',
    partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
    sortKey:      { name: 'GSI1SK', type: AttributeType.STRING },
    projectionType: ProjectionType.INCLUDE,
    nonKeyAttributes: ['confirmed'],  // include email (in GSI1SK), confirmed status
  }],
  pointInTimeRecovery: true,
  removalPolicy: RemovalPolicy.RETAIN,  // protect from accidental cdk destroy
});
```

### Access Patterns Mapped

| Operation | Pattern | DynamoDB operation |
|-----------|---------|-------------------|
| Check if (email, township) already subscribed | Get by PK + SK | `GetItem` PK=`SUB#email`, SK=`TOWNSHIP#id` |
| Subscribe (create) | Write new item | `PutItem` with condition `attribute_not_exists(PK)` |
| Confirm subscription | Update item, add GSI keys | `UpdateItem` SET `confirmed=true`, `GSI1PK`, `GSI1SK`, REMOVE `confirmToken` |
| Unsubscribe by token | Query by token, delete | `Query` + `DeleteItem` (see below for token lookup) |
| Get all confirmed subs for a township | Query GSI1 | `Query` GSI1, `GSI1PK = TOWNSHIP#16` |
| Get/write cache for a township+date | Get/Put by PK+SK | `GetItem` / `PutItem` PK=`CACHE#16`, SK=`DATE#2026-06-08` |

### Token Lookup for Unsubscribe

`unsubscribeToken` is a UUID set at subscribe time. For lookup by token:

**Option A (recommended for v1):** Store the token in the item. On `GET /unsubscribe?token=X`, do a **GSI2** on `unsubscribeToken`.

**GSI2 — Unsubscribe token lookup**

| Attribute | Value |
|-----------|-------|
| GSI2PK | `TOKEN#<unsubscribeToken>` |

Add `GSI2PK` attribute on subscribe. On unsubscribe: `Query` GSI2 → get PK + SK → `DeleteItem`.

```typescript
// Add second GSI to the table above:
globalSecondaryIndexes: [
  { indexName: 'GSI1', ... },          // confirmed subscribers by township
  {
    indexName: 'GSI2',
    partitionKey: { name: 'GSI2PK', type: AttributeType.STRING },
    projectionType: ProjectionType.KEYS_ONLY,  // only need PK+SK to delete
  },
],
```

**Option B (avoid):** Scan the whole table for the token — works at tiny scale, costs full scan at any scale.

---

## SES Email Flow

### Prerequisites (one-time setup, CDK-managed)

```typescript
// StatefulStack
const emailIdentity = new EmailIdentity(this, 'SenderIdentity', {
  identity: Identity.domain('yourdomain.nl'),  // or Identity.email('noreply@yourdomain.nl')
});
// CDK outputs the DKIM + MX records to add in DNS
```

**Important:** SES starts in sandbox mode. To send to unverified recipients (the public), you must request production access. This is a **manual step** done once in the AWS Console. The request usually takes 24–48 hours and must happen before launch.

### Flow 1: Double Opt-In (Subscription Confirmation)

```
User fills form in Angular SPA
         │
         ▼
POST /subscribe {email, townshipId}
         │
         ▼
ApiLambda
  1. Validate input (email format, valid townshipId)
  2. Check DynamoDB: does SUB#email / TOWNSHIP#id already exist?
     └─ if confirmed=true  → return 200 "already subscribed"
     └─ if confirmed=false → resend confirmation email, return 200
  3. Generate confirmToken (UUID v4), unsubscribeToken (UUID v4)
  4. PutItem with confirmed=false, confirmToken, unsubscribeToken,
     GSI2PK=TOKEN#<unsubscribeToken>
  5. Send confirmation email via SES:
     Subject: "Bevestig je aanmelding — ACV Aanhanger"
     Body: Link to GET /confirm?token=<confirmToken>
  6. Return 202 Accepted
         │
         ▼
User clicks email link → browser → GET /confirm?token=<confirmToken>
         │
         ▼
ApiLambda
  1. Scan for confirmToken (use GSI or encode PK+SK in the token URL)
     ─ Recommended: put PK+SK in the token URL itself (Base64 or separate params)
       e.g. /confirm?email=<encoded>&township=<id>&token=<confirmToken>
       This avoids a GSI3 just for confirm tokens.
  2. GetItem by PK+SK, verify confirmToken matches + not expired (24h TTL)
  3. UpdateItem: SET confirmed=true, GSI1PK, GSI1SK, REMOVE confirmToken
  4. 302 Redirect to /bevestigd page on the Angular SPA
```

**Token encoding trick:** Encode `email` and `townshipId` directly in the confirmation URL path/query alongside the token. No GSI needed for confirm — the token is just a CSRF-like check, not a lookup key.

### Flow 2: Notification Email (New Slots Detected)

```
CheckerLambda detects new slots for TOWNSHIP#16
         │
         ▼
  1. Query GSI1: GSI1PK = TOWNSHIP#16 → list of confirmed subscriber emails
  2. For each email (or batch of up to 50 with SES SendBulkEmail):
     Subject: "Nieuwe aanhanger-tijdsloten beschikbaar in jouw gemeente"
     Body (HTML):
       - Table of available slots (migrated from Telegram buildMessage())
       - Unsubscribe footer: https://yourdomain.nl/afmelden?token=<unsubscribeToken>
  3. Use SES ConfigurationSet to track bounces/complaints
```

**Batching:** `SendBulkTemplatedEmail` allows up to 50 destinations per call. For v1 (tens of subscribers), `SendEmail` in a `Promise.allSettled` loop is fine. Add batching when subscriber counts grow.

**SES Template (optional for v1):** Use inline HTML body rather than SES templates. Templates add CDK complexity with minimal benefit at small scale.

### Flow 3: Unsubscribe

```
User clicks unsubscribe link in email footer
  GET /unsubscribe?token=<unsubscribeToken>
         │
         ▼
ApiLambda
  1. Query GSI2: GSI2PK = TOKEN#<unsubscribeToken>
  2. GetItem PK+SK from GSI2 result
  3. DeleteItem
  4. 302 Redirect to /afgemeld page on Angular SPA
```

### SES Configuration Set (always create this)

```typescript
const configSet = new ConfigurationSet(this, 'SesConfigSet', {
  configurationSetName: 'AcvNotifications',
  suppressionReasons: SuppressionReasons.BOUNCES_AND_COMPLAINTS,  // auto-suppress
  reputationMetrics: true,
  sendingEnabled: true,
});
```

The suppression list automatically stops sending to addresses that hard-bounced or complained. Critical for SES reputation and staying out of sandbox re-review.

---

## Frontend Hosting

### S3 + CloudFront via CDK — not Amplify

**Recommendation: S3 + CloudFront**, managed entirely in CDK.

**Why not Amplify Hosting:**
- Amplify Hosting requires connecting a Git repository and a separate Amplify Console workflow — outside CDK control
- It's good for teams who want CI/CD from the Amplify Console, but this project already uses CDK for everything
- For a purely static Angular SPA, Amplify adds complexity without benefit

**CDK implementation:**

```typescript
// FrontendStack
const bucket = new Bucket(this, 'FrontendBucket', {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

const oac = new CfnOriginAccessControl(this, 'OAC', { ... });

const distribution = new Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new S3BucketOrigin(bucket),
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: CachePolicy.CACHING_OPTIMIZED,
  },
  defaultRootObject: 'index.html',
  errorResponses: [
    // SPA routing: return index.html on 403/404 (Angular Router handles it)
    { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
    { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
  ],
});

new BucketDeployment(this, 'DeployFrontend', {
  sources: [Source.asset('frontend/dist/acv-aanhanger/browser')],
  destinationBucket: bucket,
  distribution,
  distributionPaths: ['/*'],  // invalidate CloudFront cache on deploy
});
```

**Angular build output path:** `frontend/dist/acv-aanhanger/browser` — Angular 17+ with `application` builder outputs to `browser/` subdirectory.

**Custom domain:** Add `Certificate` (ACM, us-east-1) + `domainNames` to the Distribution construct. The certificate **must** be in `us-east-1` for CloudFront use — this is a CDK cross-region reference gotcha.

---

## CDK Stack Structure

### Two stacks (stateful / stateless split)

```
cdk/
├── bin/
│   └── app.ts                 ← CDK App entry: instantiates stacks
└── lib/
    ├── stateful-stack.ts      ← DynamoDB table + SES EmailIdentity
    └── backend-stack.ts       ← Lambdas + API Gateway + EventBridge + Frontend S3/CF
```

**Why two stacks:**

Per CDK best practices (verified from official docs): "Consider keeping stateful resources in a separate stack from stateless resources. You can then turn on termination protection on the stateful stack."

| `StatefulStack` | `BackendStack` |
|-----------------|---------------|
| DynamoDB table | CheckerLambda |
| SES EmailIdentity + ConfigurationSet | ApiLambda |
| *(termination protection: ON)* | API Gateway HTTP API |
| | EventBridge schedule |
| | S3 bucket + CloudFront distribution |
| | BucketDeployment |

The `BackendStack` receives the DynamoDB table ARN and SES configuration set name as props passed from `StatefulStack`.

**Why not three stacks (with separate FrontendStack):**  
The frontend bucket and CloudFront distribution are stateless — destroying and recreating them is fine (content redeployed on next `cdk deploy`). Keep them in `BackendStack` to reduce deployment coordination overhead.

**CDK app wiring:**

```typescript
// bin/app.ts
const app = new App();
const stateful = new StatefulStack(app, 'AcvStateful', { env });
const backend = new BackendStack(app, 'AcvBackend', {
  env,
  table: stateful.table,
  sesConfigSetName: stateful.configSetName,
  sesFromAddress: 'noreply@yourdomain.nl',
});
```

**Deployment order:** CDK handles cross-stack references automatically. `StatefulStack` deploys first because `BackendStack` depends on its outputs.

---

## Cold Start Considerations

### For the Checker Lambda (scheduled, every 10 min)

**Cold starts are essentially a non-issue.** A Lambda invoked every 10 minutes stays warm — AWS recycles execution environments after ~15 minutes of inactivity. The checker will almost always run on a warm container.

**Exception:** First invocation after deployment always cold-starts. With a small bundle (~1–2 MB after esbuild minification), this is ~300–500 ms for Node.js on ARM64 — acceptable for a background job.

### For the API Lambda (user-facing, low traffic)

**Cold starts happen on every request at low traffic.** This is the only Lambda where it matters.

**Mitigation strategy (in order of preference):**

1. **Small bundle** — `NodejsFunction` with `minify: true` + `externalModules: ['@aws-sdk/*']`. The AWS SDK v3 is included in the Lambda Node.js runtime; don't bundle it. Target bundle size: < 1 MB. Achievable with esbuild tree-shaking.

2. **ARM64 (Graviton2)** — Slightly faster cold starts than x86 and 20% cheaper per GB-second. Use it for both Lambdas.

3. **128 MB for API Lambda** — Lower memory = faster cold start for I/O-bound code. DynamoDB and SES calls are network I/O; 128 MB is sufficient.

4. **Do NOT use Provisioned Concurrency** — At v1 subscriber volumes, this wastes money. Add it only if cold starts become a user-visible problem (measurable with CloudWatch `InitDuration` metric).

5. **SnapStart NOT available for Node.js** (verified: only Java 11+, Python 3.12+, .NET 8+ as of 2026).

**Expected cold start budget:** 400–700 ms for API Lambda with small bundle on ARM64. For a subscribe/unsubscribe action (not latency-critical), this is acceptable. If the Angular SPA shows a loading state, users won't notice.

---

## Component Boundaries Summary

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `CheckerLambda` | Township scrape → diff → notify | DynamoDB (cache r/w, subscriber query), SES (send email), ACV website (HTTP) |
| `ApiLambda` | Subscribe / confirm / unsubscribe | DynamoDB (subscriber r/w), SES (send confirmation email) |
| `DynamoDB` (single table) | All persistence: subscribers + cache | Read/written by both Lambdas |
| `API Gateway HTTP API` | Route HTTP requests to ApiLambda | ApiLambda, Angular SPA (CORS) |
| `EventBridge Scheduler` | Trigger CheckerLambda on schedule | CheckerLambda |
| `SES` | Send transactional email | Called by both Lambdas |
| `S3 + CloudFront` | Host Angular SPA static assets | Browser (user) |
| `StatefulStack` | Stateful infra (table, SES identity) | Exported to BackendStack via props |
| `BackendStack` | All compute + hosting | StatefulStack outputs |

---

## Data Flow: Full Notification Cycle

```
EventBridge (rate 10 min)
  │
  └─► CheckerLambda.handler()
        │
        ├─ Scan DynamoDB → distinct confirmed townships (e.g. [16, 42, 7])
        │
        ├─ For each townshipId (Promise.allSettled):
        │   │
        │   ├─ GET acv-groep.nl/... → PHPSESSID + visitor_id
        │   │
        │   ├─ GET calendar current month + next month (parallel)
        │   │
        │   ├─ Filter: available|semi slots in next 14 days
        │   │
        │   ├─ GetItem DynamoDB: CACHE#<townshipId>/DATE#<date> for each date
        │   │
        │   ├─ Diff: any new slots not in cache?
        │   │    │
        │   │    ├─ YES → Query GSI1 for all confirmed subs for this township
        │   │    │          │
        │   │    │          └─ SES SendEmail × N recipients (Promise.allSettled)
        │   │    │
        │   │    └─ NO  → skip notify
        │   │
        │   └─ PutItem DynamoDB: CACHE#<townshipId>/DATE#<date> (update cache)
        │
        └─ Done
```

---

## Monorepo Structure Recommendation

```
acv-aanhanger/
├── frontend/                   # Angular 21+ SPA
│   ├── src/
│   └── angular.json
├── backend/
│   ├── src/
│   │   ├── checker/
│   │   │   └── handler.ts      # CheckerLambda entry point
│   │   ├── api/
│   │   │   └── handler.ts      # ApiLambda entry point
│   │   └── shared/
│   │       ├── dynamo.ts       # DynamoDB client + typed getters/putters
│   │       ├── ses.ts          # SES client + email builders
│   │       └── acv.ts          # Migrated from src/check-availability.ts
│   └── package.json
├── infrastructure/
│   ├── bin/
│   │   └── app.ts
│   ├── lib/
│   │   ├── stateful-stack.ts
│   │   └── backend-stack.ts
│   └── package.json
└── src/                        # Original script (keep as reference, do not delete)
    └── check-availability.ts
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing cache in Lambda /tmp

**What:** Writing cache JSON to `/tmp/availability_cache.json` inside Lambda.  
**Why bad:** `/tmp` is per-execution-environment. A new container = cold start = empty cache = false positive notifications on every cold start.  
**Instead:** DynamoDB per-township cache. Always.

### Anti-Pattern 2: Scanning DynamoDB to find subscribers by token

**What:** `Scan` the entire table looking for an item with `unsubscribeToken = X`.  
**Why bad:** Costs read capacity proportional to table size. Breaks with large subscriber counts.  
**Instead:** GSI2 on `GSI2PK = TOKEN#<token>`. Point query, O(1) cost.

### Anti-Pattern 3: Using SES REST API `sandbox` mode in production

**What:** Forgetting to request SES production access before launch.  
**Why bad:** In sandbox, SES only sends to verified email addresses. Real subscribers (unverified) will get rejected with a `MessageRejected` error.  
**Instead:** Request production access in AWS Console during infrastructure setup phase, before any user-facing deploy.

### Anti-Pattern 4: Hardcoded resource names in CDK

**What:** `tableName: 'AcvSubscriptions'` as a literal in CDK construct.  
**Why bad:** Can't deploy two environments (dev/prod) to the same account. Resource replacement requires same physical name while old exists.  
**Instead:** Let CDK generate names. Pass via env vars: `TABLE_NAME: table.tableName`.

### Anti-Pattern 5: One Lambda per route

**What:** Separate `SubscribeLambda`, `ConfirmLambda`, `UnsubscribeLambda`.  
**Why bad:** Tripling CDK boilerplate and IAM policies for 3 routes that share all the same permissions and dependencies.  
**Instead:** Single `ApiLambda` with `switch(event.routeKey)` routing internally.

### Anti-Pattern 6: Using REST API (v1) instead of HTTP API (v2)

**What:** `aws-apigateway` L2 construct (REST API v1) instead of `aws-apigatewayv2`.  
**Why bad:** REST API is ~70% more expensive per million requests, has slower cold-path overhead, and requires more CDK wiring for CORS.  
**Instead:** `HttpApi` from `aws-cdk-lib/aws-apigatewayv2` with `HttpLambdaIntegration`.

---

## Scalability Considerations

| Concern | At 100 subscribers | At 10K subscribers | At 100K subscribers |
|---------|-------------------|--------------------|--------------------|
| Notification fan-out | `Promise.allSettled` loop, SES SendEmail | `SendBulkTemplatedEmail` (50/batch) | SES + SQS fan-out queue |
| Township parallelism | All in one Lambda invocation | Still fine (< 50 townships) | Fan-out: EventBridge → SQS per township |
| DynamoDB reads | On-demand billing, negligible | On-demand billing, still cheap | Consider provisioned capacity |
| Lambda concurrency | 1 concurrent checker + occasional API | 1 checker + occasional API | Same; API Lambda gets bursts |
| Cold starts | Acceptable (128 MB ARM64 API Lambda) | Add Provisioned Concurrency if needed | Provisioned Concurrency |

---

## Sources

- AWS CDK v2 Best Practices (official): https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html — HIGH confidence
- AWS Lambda Best Practices (official): https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html — HIGH confidence
- Lambda Runtimes (official): https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html — HIGH confidence (Node.js 22 confirmed current)
- Lambda SnapStart supported runtimes (official): https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html — HIGH confidence (Node.js NOT supported)
- DynamoDB Core Components / GSI (official): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html — HIGH confidence
- DynamoDB NoSQL Design Best Practices (official): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html — HIGH confidence
- SES Creating Identities (official): https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html — HIGH confidence
- Lambda Function URLs vs API Gateway (official): https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html — HIGH confidence
- AWS Lambda Powertools TypeScript (Context7 / GitHub): https://github.com/aws-powertools/powertools-lambda-typescript — HIGH confidence
