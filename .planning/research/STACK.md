# Technology Stack

**Project:** ACV Aanhanger — Trailer Rental Availability Subscription App
**Researched:** 2025-06-12
**Confidence:** HIGH (all versions verified via npm registry + Context7 official docs)

---

## Recommended Stack

### Angular Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@angular/core` | 21.2.x | Framework core | Latest stable; signals are fully stable; standalone components are the default |
| `@angular/cli` | 21.2.x | Tooling / build | Vite-based builder (`@angular-devkit/build-angular`); fast HMR; esbuild for prod |
| `@angular/router` | 21.2.x | Client-side routing | `provideRouter()` functional API; lazy-loaded route components |
| `@angular/forms` | 21.2.x | Forms + validation | **Signal Forms API** (`@angular/forms/signals`) — new in v20, stable in v21 |
| `@angular/common/http` | 21.2.x | HTTP client | `httpResource()` for reactive data; `provideHttpClient()` functional provider |
| `@angular/platform-browser` | 21.2.x | DOM bootstrapping | `bootstrapApplication()` — no AppModule |

**Angular 21-specific patterns (mandatory for this project):**

```typescript
// bootstrap — no AppModule, no NgModules anywhere
bootstrapApplication(AppComponent, appConfig);

// appConfig — functional providers only
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
  ],
};

// Components — standalone: true is the default in v17+, explicit for clarity
@Component({
  selector: 'app-subscribe',
  standalone: true,
  imports: [FormField],   // import directives/pipes directly, no shared modules
  changeDetection: ChangeDetectionStrategy.OnPush,  // always OnPush with signals
  template: `...`,
})

// Control flow — use @if/@for/@switch, never *ngIf/*ngFor
@if (form.email().invalid()) { <p>...</p> }
@for (township of townships(); track township.id) { ... }

// Signals — for all reactive state
readonly email = signal('');
readonly townships = signal<Township[]>([]);
readonly selectedTownship = linkedSignal(() => this.townships()[0] ?? null);

// Signal Forms — for the subscription form
subscribeModel = signal({ email: '', townshipId: '' });
subscribeForm = form(this.subscribeModel, (path) => {
  required(path.email, { message: 'E-mailadres is verplicht' });
  email(path.email, { message: 'Voer een geldig e-mailadres in' });
  required(path.townshipId, { message: 'Kies een gemeente' });
});

// httpResource — for loading township list from API
townships = httpResource<Township[]>('/api/townships');
```

---

### AWS Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `aws-cdk-lib` | 2.257.x | Infrastructure as code | CDK v2 — all constructs in one package; no separate `@aws-cdk/*` imports |
| `constructs` | 10.6.x | CDK base class | Peer dep of aws-cdk-lib; must match |
| `aws-cdk` (CLI) | 2.x | Deploy / synth / diff | `cdk deploy`, `cdk synth`, `cdk diff` |
| `@aws-cdk/aws-lambda-nodejs` | bundled in aws-cdk-lib | TypeScript Lambda bundling | `NodejsFunction` construct; esbuild under the hood; no manual tsc step |

**CDK v2 pattern — everything from `aws-cdk-lib`:**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
```

---

### Lambda Runtime & Bundling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `lambda.Runtime.NODEJS_22_X` | Node 22 LTS | Lambda runtime | Node 22 is the latest LTS on Lambda as of 2025; avoid `NODEJS_LATEST` in prod (can change under you) |
| `NodejsFunction` | (aws-cdk-lib) | TypeScript Lambda construct | Runs esbuild at synth time; produces small zips; no separate `tsc` step; handles `tsconfig` automatically |
| `@types/aws-lambda` | 8.10.x | Lambda handler types | Type-safe `APIGatewayProxyEventV2`, `ScheduledEvent`, `Context` |

**NodejsFunction example:**

```typescript
const checkHandler = new lambdaNode.NodejsFunction(this, 'CheckAvailability', {
  entry: 'src/lambda/check-availability.ts',
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_22_X,
  timeout: cdk.Duration.seconds(30),
  environment: {
    TABLE_NAME: table.tableName,
    SES_FROM_EMAIL: 'noreply@yourdomain.nl',
  },
  bundling: {
    minify: true,
    sourceMap: false,
    target: 'node22',
    // externalModules: [] — SDK v3 is NOT pre-bundled on Node 22 Lambda, always bundle it
  },
});
```

> **Critical:** On Node 18+, AWS SDK v3 is **not** pre-installed on Lambda. Always bundle it.
> Do **not** add `@aws-sdk/*` to `externalModules`.

---

### Scheduled Jobs (Cron)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `aws-events` + `aws-events-targets` | bundled in aws-cdk-lib | EventBridge Rule → Lambda | Native CDK; cron expression on `events.Rule`; prefer over EventBridge Scheduler for simple periodic jobs |

```typescript
const rule = new events.Rule(this, 'CheckSchedule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '8,12,17', weekDay: 'MON-SAT' }),
});
rule.addTarget(new targets.LambdaFunction(checkHandler));
```

---

### API Gateway

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `aws-apigatewayv2` + `aws-apigatewayv2-integrations` | bundled in aws-cdk-lib | HTTP API | HTTP API v2 is ~70% cheaper than REST API v1; lower latency; sufficient for this use case; CORS support built-in |

```typescript
const api = new apigatewayv2.HttpApi(this, 'AcvApi', {
  corsPreflight: {
    allowOrigins: ['https://yourdomain.nl'],
    allowMethods: [apigatewayv2.CorsHttpMethod.POST],
  },
});
api.addRoutes({
  path: '/subscribe',
  methods: [apigatewayv2.HttpMethod.POST],
  integration: new HttpLambdaIntegration('Subscribe', subscribeHandler),
});
```

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `dynamodb.TableV2` | bundled in aws-cdk-lib | Infrastructure | `TableV2` is the **preferred** construct (replaces legacy `Table`); supports global tables if needed |
| `@aws-sdk/client-dynamodb` | 3.1053.x | Low-level DynamoDB | Base client; use via `DynamoDBDocumentClient` wrapper |
| `@aws-sdk/lib-dynamodb` | 3.1053.x | DynamoDB Document client | Automatic JS ↔ DynamoDB type marshaling; use `GetCommand`, `PutCommand`, `QueryCommand`, `DeleteCommand` |

**Table design (single-table, per-subscriber):**

```typescript
const table = new dynamodb.TableV2(this, 'Subscribers', {
  partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'townshipId', type: dynamodb.AttributeType.STRING },
  billing: dynamodb.Billing.onDemand(),   // no capacity planning needed; scales to zero
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: cdk.RemovalPolicy.RETAIN, // never accidentally destroy subscriber data
});

// GSI: look up by unsubscribe token (for one-click unsubscribe links)
table.addGlobalSecondaryIndex({
  indexName: 'token-index',
  partitionKey: { name: 'unsubscribeToken', type: dynamodb.AttributeType.STRING },
});
```

**DynamoDB access pattern in Lambda:**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Put subscriber
await ddb.send(new PutCommand({
  TableName: process.env.TABLE_NAME,
  Item: { email, townshipId, confirmed: false, unsubscribeToken: randomUUID() },
  ConditionExpression: 'attribute_not_exists(email) AND attribute_not_exists(townshipId)',
}));

// Query all confirmed subscribers for a township
await ddb.send(new QueryCommand({
  TableName: process.env.TABLE_NAME,
  KeyConditionExpression: 'townshipId = :t',  // requires GSI if townshipId is SK
  // Design note: if querying by townshipId is the hot path, add a GSI on townshipId
}));
```

---

### Email (SES v2)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@aws-sdk/client-sesv2` | 3.1053.x | Send transactional email | SES API v2 is the current API; v1 is legacy; v2 supports templates, suppression list, better deliverability controls |
| `aws-cdk-lib/aws-ses` | bundled | SES identity verification (CDK) | Verify domain/email sending identity via CDK |

**SES v2 send pattern in Lambda:**

```typescript
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({});

await ses.send(new SendEmailCommand({
  FromEmailAddress: process.env.SES_FROM_EMAIL,
  Destination: { ToAddresses: [subscriberEmail] },
  Content: {
    Simple: {
      Subject: { Data: 'Bevestig je aanmelding — ACV Aanhanger', Charset: 'UTF-8' },
      Body: {
        Html: { Data: buildConfirmationHtml(token), Charset: 'UTF-8' },
        Text: { Data: buildConfirmationText(token), Charset: 'UTF-8' },
      },
    },
  },
}));
```

> **SES Sandbox:** New AWS accounts are in SES sandbox (can only send to verified addresses). Production deployment requires requesting SES production access. Plan this in infrastructure phase.

---

### Input Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | 4.4.x | Lambda input validation | Type-safe parsing of API Gateway payloads; throws on invalid input; `z.parse()` at handler entry; integrates with Angular Signal Forms' `validateStandardSchema()` |
| `uuid` (Node built-in `crypto.randomUUID`) | — | Token generation | `crypto.randomUUID()` is built into Node 22; no dependency needed for unsubscribe tokens |

```typescript
// Lambda: validate subscribe payload
const SubscribeSchema = z.object({
  email: z.email(),
  townshipId: z.string().min(1).max(10),
});
const body = SubscribeSchema.parse(JSON.parse(event.body ?? '{}'));
```

---

### Frontend Hosting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `aws-cdk-lib/aws-s3` + `aws-cdk-lib/aws-cloudfront` | bundled | Static hosting | S3 + CloudFront distribution; `ng build` produces static assets; CDK `BucketDeployment` deploys them |
| `aws-cdk-lib/aws-s3-deployment` | bundled | Deploy Angular build to S3 | `BucketDeployment` syncs `dist/` to S3 with cache headers |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Angular forms | `@angular/forms/signals` (Signal Forms) | `ReactiveFormsModule` | Signal Forms is the Angular team's forward direction in v20+; reactive forms still work but are the legacy path; Signal Forms compose cleanly with signals |
| RxJS in components | Minimal (`toSignal` bridge only) | Full RxJS streams | Angular's official guidance: use signals for state, RxJS only when needed for complex async; eliminates async pipe, subscription management |
| State management | Angular signals + services | NgRx, Akita, NGXS | App is too simple for a store; one service + signals covers it; NgRx adds significant boilerplate |
| Lambda runtime | `NODEJS_22_X` | `NODEJS_LATEST` | `NODEJS_LATEST` changes when Lambda updates; can break unexpectedly; pin to `NODEJS_22_X` for stability |
| API Gateway | HTTP API v2 (`aws-apigatewayv2`) | REST API v1 (`aws-apigateway`) | REST API v1 is ~3.5× more expensive; HTTP API v2 supports CORS natively; sufficient for simple POST/GET endpoints |
| DynamoDB construct | `TableV2` | `Table` | AWS CDK docs explicitly state `TableV2` is the preferred construct; `Table` (v1) is legacy |
| Email send | `@aws-sdk/client-sesv2` | `@aws-sdk/client-ses` (v1) | SES API v1 is legacy; v2 is current and has richer feature set |
| CSS framework | TailwindCSS v4 or none | Angular Material | Form is minimal (email + dropdown + submit); Material is heavy for this; Tailwind utility classes or plain CSS is sufficient |
| Build output | `ng build` (Vite/esbuild) | Custom Webpack | Angular CLI 21 uses Vite + esbuild by default; faster builds; no need to eject |

---

## Project-Specific Notes

### Reusing the Existing Checker Script

The existing `src/check-availability.ts` uses:
- `fetch` (built-in Node 22) ✅ — works in Lambda without changes
- `PHPSESSID` + `visitor_id` cookie session pattern
- Telegram notification (remove — replace with SES)
- File system cache (`availability_cache.json`) — **must replace with DynamoDB**

The session/calendar fetching logic is portable to Lambda. The cache read/write must move from file system to DynamoDB. The Telegram send must be replaced with SES email fan-out per township.

### DynamoDB Access Pattern for the Checker Lambda

The checker Lambda runs per township. It needs:
1. `QueryCommand` — get all confirmed subscribers for `townshipId`
2. `GetCommand` / `PutCommand` — read and write the per-township availability cache

Consider storing the cache as a separate item type in the same table:
- Subscriber: `PK=email, SK=townshipId`
- Cache entry: `PK=CACHE#townshipId, SK=CACHE#townshipId`

---

## Installation

### Angular Frontend

```bash
# Create new Angular app (no NgModules, standalone, signals)
ng new acv-frontend --standalone --style=css --routing=true

# Angular is already at 21.x via @angular/cli
# No extra signal or control-flow packages needed — all built-in since v17/v20
```

### AWS CDK Infrastructure

```bash
# Initialize CDK app (TypeScript)
mkdir infra && cd infra
cdk init app --language typescript

# Runtime dependencies (Lambda code)
npm install \
  @aws-sdk/client-dynamodb \
  @aws-sdk/lib-dynamodb \
  @aws-sdk/client-sesv2 \
  zod

# CDK + dev
npm install -D \
  aws-cdk-lib \
  constructs \
  @types/aws-lambda \
  @types/node \
  typescript \
  tsx
```

---

## Sources

- Angular 21 signals & standalone: https://angular.dev/guide/signals (Context7: `/websites/angular_dev`, HIGH confidence)
- Angular Signal Forms: https://angular.dev/guide/forms/signals (Context7: `/websites/angular_dev`, HIGH confidence)
- Angular new control flow: https://angular.dev/guide/templates/control-flow (HIGH confidence)
- Angular `httpResource`: https://angular.dev/guide/http/http-resource (HIGH confidence)
- AWS CDK v2 guide: https://github.com/awsdocs/aws-cdk-guide (Context7: `/awsdocs/aws-cdk-guide`, HIGH confidence)
- CDK `NodejsFunction`: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda-nodejs/README.md (HIGH confidence)
- CDK `TableV2`: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-dynamodb/README.md (HIGH confidence)
- CDK `aws-apigatewayv2`: https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-apigatewayv2/README.md (HIGH confidence)
- `@aws-sdk/client-sesv2` v3: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/ (HIGH confidence)
- Versions verified: npm registry 2025-06-12
