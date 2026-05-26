# Phase 2: Backend — Subscription API + Checker + Notifications — Research

**Researched:** 2026-06-12
**Domain:** AWS Lambda (Node 22/ARM64) · DynamoDB single-table · Amazon SES v2 · TypeScript
**Confidence:** HIGH — all packages installed in Phase 1 and verified locally; patterns drawn from official docs, STACK.md, and ARCHITECTURE.md already approved for this project.

---

## Summary

Phase 2 implements the complete serverless backend. The skeleton from Phase 1 is in place: both Lambda stubs exist, the CDK stacks are wired, the DynamoDB table with GSI1/GSI2 is defined (but not yet deployed), and all runtime packages are already installed in `backend/package.json`. This phase fills in the business logic — no new infrastructure constructs are required, and no new packages need to be installed.

The three main concerns are: (1) the **ApiLambda** implementing the double opt-in subscriber lifecycle (`POST /subscribe` → confirmation email → `GET /confirm` → confirmed; `GET /unsubscribe` → hard-delete); (2) the **CheckerLambda** migrating `src/check-availability.ts` to the Lambda runtime, replacing file cache with DynamoDB and Telegram with SES email fan-out; (3) **email templates** that are Dutch-language, HTML+plain-text, and RFC 8058 compliant.

One infrastructure gap from Phase 1 must be resolved first: the DynamoDB table does not yet declare `timeToLiveAttribute: 'ttl'`. This attribute must be added to `StatefulStack` before deploying, so that PENDING subscriber records auto-expire after 24 hours (TTL field stored in epoch seconds).

**Primary recommendation:** Implement in this order: (1) patch `StatefulStack` to add TTL attribute, (2) implement DynamoDB helper module (`backend/src/shared/dynamo.ts`), (3) SES helper module (`backend/src/shared/ses.ts`), (4) ACV scraper module (`backend/src/shared/acv.ts`), (5) `ApiLambda` handler, (6) `CheckerLambda` handler, (7) CDK Assertions tests filling in the `it.todo()` stubs.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Double opt-in flow | API Lambda | DynamoDB + SES | Route logic lives in Lambda; state in DB; delivery via SES |
| Rate limiting | API Lambda (in-memory) | — | In-process Map per container; sufficient for v1; no Redis needed |
| Token validation / confirm | API Lambda | DynamoDB (ConditionExpression) | Conditional write enforces atomicity at the DB layer |
| GDPR hard-delete | API Lambda | DynamoDB DeleteItem | DeleteItem on unsubscribe; no soft-delete anywhere |
| Consent timestamp | API Lambda | DynamoDB | Stored at confirm time, not at subscribe time |
| ACV scraping | Checker Lambda | — | Direct HTTP with cookies; runs per EventBridge tick |
| Availability cache | Checker Lambda | DynamoDB (CACHE# items) | DB replaces file system; per-township keys |
| Township fan-out discovery | Checker Lambda | DynamoDB GSI1 | Query distinct GSI1PK values to find active townships |
| Notification delivery | Checker Lambda | Amazon SES | SES `SendEmailCommand` per subscriber; "immediately" path |
| Daily digest accumulation | Checker Lambda | DynamoDB (DIGEST# items) | Accumulate in DB, flush via separate daily EventBridge trigger |
| Email compliance (RFC 8058) | API Lambda + Checker Lambda | — | Both set `List-Unsubscribe` headers on outbound mail |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-04 | Duplicate subscription silently resends confirmation (no duplicate record) | `PutItem` with `attribute_exists` condition → `ConditionalCheckFailedException` caught → resend SES; not an error |
| SUB-05 | Subscribe endpoint rate-limited per IP | In-memory `Map<ip, timestamps[]>` in module scope; max 5 requests per 60 s |
| SUB-06 | Confirmation email sent immediately after subscribe | SES `SendEmailCommand` inside `POST /subscribe` handler after successful PutItem |
| SUB-07 | Confirmation token single-use, expires 24 h | `confirmToken` + `ttl = now+86400s` stored on item; TTL attribute on DynamoDB table; token removed on confirm |
| SUB-08 | User confirms by clicking email link | `GET /confirm?token=X&email=Y&township=Z` → `UpdateItem` with `ConditionExpression` |
| SUB-09 | Confirmation uses ConditionExpression to prevent replay | `ConditionExpression: 'attribute_exists(PK) AND confirmed = :false AND confirmToken = :token'` |
| SUB-10 | Confirmed record stores email, township, frequency, confirmed, consentTimestamp, unsubscribeToken | `UpdateItem` in confirm handler adds `confirmed=true`, `consentTimestamp`, `GSI1PK`, `GSI1SK`; removes `confirmToken` |
| UNSUB-01 | Every notification email has List-Unsubscribe + footer link | `List-Unsubscribe` / `List-Unsubscribe-Post` headers on all SES sends |
| UNSUB-03 | Clicking unsubscribe hard-deletes DynamoDB record | `DeleteItem` by PK+SK (resolved via GSI2 query); no status field |
| UNSUB-04 | Unsubscribe token single-use; replay returns graceful error | After `DeleteItem`, item is gone; GSI2 query returns 0 results → 410 "already unsubscribed" |
| CHK-01 | Lambda scrapes ACV per township (PHPSESSID + visitor_id) | Migrated `getSession()` + `fetchCalendarMonth()` from `src/check-availability.ts` |
| CHK-03 | Cache stored in DynamoDB (CACHE#<townshipId>) | `PK=CACHE#<id>`, `SK=DATE#<YYYY-MM-DD>` per slot; `PK=CACHE#<id>`, `SK=META` for lastChecked |
| CHK-04 | Only townships with confirmed subscribers are scraped | Query distinct `GSI1PK` values from GSI1 before scrape loop |
| CHK-05 | Scraper failure throws hard error (no silent cache overwrite) | Zod parse failure or `days.length < 10` → throw, not return empty |
| CHK-06 | New slots detected by diff against DynamoDB cache | Load `CACHE#<townshipId>` items; compare slot sets; new = not in cache |
| CHK-07 | "Immediately" subscribers receive email per checker run | GSI1 query for `frequency = 'immediately'` subscribers → SES fan-out |
| CHK-08 | "Daily digest" subscribers get one aggregated email/day | Accumulate `DIGEST#<townshipId>#<email>` items; flush via daily EventBridge rule |
| NOTIF-01 | Notification lists dates, times, booking link | HTML template with slot table + `https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen` |
| NOTIF-02 | Notification formatted in Dutch | All strings in `nl-NL`; date formatting via `toLocaleDateString('nl-NL', ...)` |
| NOTIF-03 | Notification includes unsubscribe footer | `<a href="${FRONTEND_URL}/uitschrijven?token=${unsubscribeToken}">Afmelden</a>` in all notification templates |
| NOTIF-04 | SES sends only to confirmed subscribers (GSI1 query) | GSI1 query filters by `GSI1PK = TOWNSHIP#<id>`; only confirmed items have GSI1 keys (sparse GSI) |
| COMP-02 | Consent timestamp stored with subscriber record at confirmation | `consentTimestamp = new Date().toISOString()` set in `UpdateItem` at `GET /confirm` |
| COMP-03 | Hard-delete on unsubscribe; no retention | `DeleteItem` only; no `UpdateItem`; no status field |
</phase_requirements>

---

## Standard Stack

All packages are already installed from Phase 1. No `npm install` step required in Phase 2.

### Core (already in `backend/package.json`)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@aws-sdk/client-dynamodb` | 3.1053.0 | DynamoDB base client | [VERIFIED: npm registry] — installed |
| `@aws-sdk/lib-dynamodb` | 3.1053.0 | Document client (marshaling) | [VERIFIED: npm registry] — installed |
| `@aws-sdk/client-sesv2` | 3.1053.0 | SES API v2 | [VERIFIED: npm registry] — installed |
| `zod` | 4.4.3 | Input validation | [VERIFIED: npm registry] — installed |
| `@types/aws-lambda` | 8.10.161 | Lambda handler types | [VERIFIED: npm registry] — dev dep |

### CDK-side (in `infrastructure/package.json`)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `aws-cdk-lib` | 2.257.0 | All CDK constructs | [VERIFIED: npm registry] — installed |
| `aws-cdk-lib/assertions` | bundled | CDK Assertions for tests | [VERIFIED: official docs] — built-in |

### No new packages needed

Phase 2 is entirely implemented with packages from Phase 1. `crypto.randomUUID()` is built into Node 22.

---

## Package Legitimacy Audit

> All packages were installed and verified in Phase 1. No new installs in Phase 2.

| Package | Registry | Age | Downloads | slopcheck | Disposition |
|---------|----------|-----|-----------|-----------|-------------|
| `@aws-sdk/client-dynamodb` | npm | AWS-official | Billions/wk | N/A (official AWS SDK) | Approved |
| `@aws-sdk/lib-dynamodb` | npm | AWS-official | Billions/wk | N/A (official AWS SDK) | Approved |
| `@aws-sdk/client-sesv2` | npm | AWS-official | Billions/wk | N/A (official AWS SDK) | Approved |
| `zod` | npm | 5+ yrs | 50M+/wk | N/A (canonical schema library) | Approved |

*slopcheck was not available at research time but all packages are official AWS SDK packages or canonical widely-used libraries. No user confirmation gate needed.*

**Packages removed due to [SLOP]:** none
**Packages flagged [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
EventBridge (rate 10 min)
        │
        ▼
 CheckerLambda
  ┌─────────────────────────────────────────────┐
  │ 1. Query GSI1 → distinct confirmed townships │
  │ 2. Per township (Promise.allSettled):        │
  │    a. GET /ajax/session → PHPSESSID          │
  │    b. POST SetProfileOption → visitor_id     │
  │    c. Fetch calendar (2 months)              │
  │    d. Zod parse → throw on failure (CHK-05) │
  │    e. GetItem CACHE#<id> → diff              │
  │    f. If new slots:                          │
  │       · "immediately" → SES fan-out          │
  │       · "daily" → merge DIGEST# item        │
  │    g. PutItem CACHE#<id> (updated state)     │
  └─────────────────────────────────────────────┘
        │
        ▼
 Amazon SES ──► subscriber inboxes

EventBridge (daily 08:00)
        │
        ▼
 CheckerLambda (event.source = 'daily-digest-flush')
        │  Query all DIGEST# items → send digest emails → delete items
        ▼
 Amazon SES ──► daily digest inboxes

API Gateway HTTP API
  POST /subscribe  ──► ApiLambda ──► DynamoDB PutItem + SES confirmation email
  GET  /confirm    ──► ApiLambda ──► DynamoDB UpdateItem (ConditionExpression)
  GET  /unsubscribe──► ApiLambda ──► DynamoDB GSI2 Query → DeleteItem
```

### Recommended Source Structure

```
backend/src/
├── api/
│   └── handler.ts          # ApiLambda: POST /subscribe, GET /confirm, GET /unsubscribe
├── checker/
│   └── handler.ts          # CheckerLambda: scrape + diff + notify
└── shared/
    ├── dynamo.ts            # DynamoDB client singleton + typed command helpers
    ├── ses.ts               # SES client singleton + sendEmail() wrapper + templates
    └── acv.ts               # Migrated from src/check-availability.ts (no Telegram, no FS cache)
```

---

## Concern 1: DynamoDB Schema and Access Patterns

### Item Shapes

**Subscriber record (PENDING — before confirm)**

```typescript
// Written by POST /subscribe
{
  PK:                'SUB#jeffrey@example.com',  // string
  SK:                'TOWNSHIP#16',              // string
  confirmed:          false,                     // boolean
  frequency:         'immediately',             // 'immediately' | 'daily'
  confirmToken:      'uuid-v4',                 // removed at confirm
  unsubscribeToken:  'uuid-v4',                 // permanent; used in GSI2
  GSI2PK:            'TOKEN#uuid-v4',           // GSI2 partition key
  createdAt:         '2026-06-12T10:00:00Z',    // ISO string
  ttl:               1718193600,                // epoch seconds, now + 86400
  // GSI1PK and GSI1SK intentionally ABSENT — item invisible in GSI1 until confirmed
}
```

**Subscriber record (CONFIRMED — after confirm)**

```typescript
// After GET /confirm → UpdateItem
{
  PK:               'SUB#jeffrey@example.com',
  SK:               'TOWNSHIP#16',
  confirmed:         true,
  frequency:        'immediately',
  unsubscribeToken: 'uuid-v4',
  GSI2PK:           'TOKEN#uuid-v4',
  GSI1PK:           'TOWNSHIP#16',              // added at confirm → appears in GSI1
  GSI1SK:           'CONFIRMED#jeffrey@example.com',
  consentTimestamp: '2026-06-12T10:05:00Z',    // COMP-02
  createdAt:        '2026-06-12T10:00:00Z',
  // confirmToken:  REMOVED at confirm
  // ttl:           REMOVED at confirm (item must not expire after confirm)
}
```

**Availability cache (per township per date)**

```typescript
// Written by CheckerLambda after successful scrape
{
  PK:        'CACHE#16',
  SK:        'DATE#2026-06-15',
  state:     'available',       // 'available' | 'semi'
  slots:     ['08:00 - 10:00', '14:00 - 16:00'],
  updatedAt: '2026-06-12T08:10:00Z',
}

// Metadata item per township
{
  PK:          'CACHE#16',
  SK:          'META',
  lastChecked: '2026-06-12T08:10:00Z',
}
```

**Daily digest queue item**

```typescript
// Written/updated by CheckerLambda for 'daily' subscribers
{
  PK:        'DIGEST#16#jeffrey@example.com',
  SK:        'DIGEST',
  townshipId: '16',
  email:     'jeffrey@example.com',
  unsubscribeToken: 'uuid-v4',
  slots: [
    { date: '2026-06-15', state: 'available', slots: ['08:00 - 10:00'], isNew: true },
  ],
  createdAt: '2026-06-12T08:10:00Z',
  ttl:       1718452800,  // expire after 3 days if flush never fires
}
```

### GSI1 — "All confirmed subscribers for a township" (sparse)

```
Query: GSI1PK = 'TOWNSHIP#16'
Returns: confirmed subscribers with their email (in GSI1SK), frequency, confirmed flag
```

Sparse projection: `GSI1PK` and `GSI1SK` are only written to the item at confirm time (via `UpdateItem`). PENDING items have no GSI1 keys → they don't appear in GSI1 at all. This enforces NOTIF-04 at the DB layer.

GSI1 projection includes `nonKeyAttributes: ['confirmed', 'frequency']` (already in StatefulStack).

### GSI2 — "Subscriber by unsubscribe token"

```
Query: GSI2PK = 'TOKEN#<unsubscribeToken>'
Returns: PK + SK (KEYS_ONLY projection — sufficient to then DeleteItem)
```

Written at subscribe time and never changes. After `DeleteItem`, item is gone; replayed token returns 0 results → graceful "already unsubscribed".

### Required StatefulStack Patch

The Phase 1 `StatefulStack` is missing `timeToLiveAttribute`. Add this before first deploy:

```typescript
// infrastructure/lib/stateful-stack.ts — add to TableV2 constructor props
timeToLiveAttribute: 'ttl',
```

This enables DynamoDB TTL globally for the table. Items with `ttl` in epoch seconds auto-expire. Without this, PENDING records accumulate forever (CHK-07 requirement for auto-cleanup at 24 h).

### Access Pattern Summary

| Operation | DynamoDB call | Key expression |
|-----------|--------------|----------------|
| Subscribe (create) | `PutItem` with condition | `ConditionExpression: 'attribute_not_exists(PK)'` |
| Subscribe (duplicate check — confirmed) | `GetItem` | PK + SK; check `confirmed` field |
| Subscribe (duplicate check — pending) | `GetItem` | PK + SK; resend SES if found |
| Confirm | `UpdateItem` with condition | `ConditionExpression: 'attribute_exists(PK) AND confirmed = :f AND confirmToken = :t'` |
| Unsubscribe — token lookup | `Query` GSI2 | `GSI2PK = TOKEN#<token>` |
| Unsubscribe — delete | `DeleteItem` | PK + SK from GSI2 result |
| Checker — find active townships | `Query` GSI1 | Scan GSI1 with distinct `GSI1PK` values |
| Checker — fan-out for township | `Query` GSI1 | `GSI1PK = TOWNSHIP#<id>` + `frequency` filter |
| Checker — read cache | `Query` | PK = `CACHE#<id>`, SK begins_with `DATE#` |
| Checker — write cache | `PutItem` | PK = `CACHE#<id>`, SK = `DATE#<YYYY-MM-DD>` |
| Digest flush — find all digests | `Scan` / GSI | PK begins_with `DIGEST#` (or dedicated GSI3 for v2) |
| Digest flush — delete after send | `DeleteItem` | PK + SK |

**Note on digest flush scan:** For v1 (few subscribers), a full table Scan filtered on PK prefix is acceptable. The digest items are a small fraction of total table items. Add a dedicated GSI in v2 if needed.

---

## Concern 2: ApiLambda Routing

### Routing via `event.routeKey`

API Gateway HTTP API v2 sets `event.routeKey` to the string `"METHOD /path"`. Route in a single switch:

```typescript
// backend/src/api/handler.ts
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  switch (event.routeKey) {
    case 'POST /subscribe':   return handleSubscribe(event);
    case 'GET /confirm':      return handleConfirm(event);
    case 'GET /unsubscribe':  return handleUnsubscribe(event);
    default:
      return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
  }
}
```

### POST /subscribe — Zod Validation + Duplicate Guard

```typescript
import { z } from 'zod';

// Zod v4: z.email() is a standalone function (top-level schema, not z.string().email())
const SubscribeSchema = z.object({
  email:      z.email(),
  townshipId: z.string().min(1).max(10),
  frequency:  z.enum(['immediately', 'daily']),
});

async function handleSubscribe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // 1. Rate limit check (see Concern 2.1 below)
  const ip = event.requestContext.http.sourceIp;
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ message: 'Te veel verzoeken. Probeer het later opnieuw.' }) };
  }

  // 2. Validate body
  const parsed = SubscribeSchema.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Ongeldig verzoek', errors: parsed.error.issues }) };
  }
  const { email, townshipId, frequency } = parsed.data;

  // 3. Duplicate check via GetItem
  const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SUB#${email}`, SK: `TOWNSHIP#${townshipId}` } }));
  if (existing.Item?.confirmed) {
    return { statusCode: 200, body: JSON.stringify({ message: 'Al aangemeld' }) }; // silent
  }
  if (existing.Item) {
    // PENDING — resend confirmation, return 200 (SUB-04)
    await sendConfirmationEmail(email, townshipId, existing.Item.confirmToken as string);
    return { statusCode: 200, body: JSON.stringify({ message: 'Controleer je e-mail' }) };
  }

  // 4. Create PENDING record
  const confirmToken    = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();
  const ttl = Math.floor(Date.now() / 1000) + 86400; // 24 h TTL
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `SUB#${email}`, SK: `TOWNSHIP#${townshipId}`,
      confirmed: false, frequency, confirmToken, unsubscribeToken,
      GSI2PK: `TOKEN#${unsubscribeToken}`, createdAt: new Date().toISOString(), ttl,
    },
    ConditionExpression: 'attribute_not_exists(PK)',  // guard against race (already handled by GetItem above, but belt+suspenders)
  }));

  // 5. Send confirmation email
  await sendConfirmationEmail(email, townshipId, confirmToken);
  return { statusCode: 202, body: JSON.stringify({ message: 'Controleer je e-mail' }) };
}
```

### Rate Limiting (In-Memory)

```typescript
// Module-scope Map — persists across warm invocations within the same container
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}
```

**Limitation:** In-memory rate limiting is per-Lambda container. With AWS Lambda concurrency scaling, two concurrent containers each have independent maps. For v1 (low traffic), this is acceptable and avoids DynamoDB overhead per request. Document limitation; upgrade to DynamoDB-backed rate limit in v2 if abuse occurs.

### GET /confirm — Conditional Update

The confirm URL encodes `email`, `township`, and `token` directly (no GSI3 needed):

```
/confirm?token=<confirmToken>&email=<base64url(email)>&township=<townshipId>
```

```typescript
async function handleConfirm(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { token, email: encodedEmail, township } = event.queryStringParameters ?? {};
  if (!token || !encodedEmail || !township) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Ongeldige link' }) };
  }
  const email = Buffer.from(encodedEmail, 'base64url').toString('utf8');

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SUB#${email}`, SK: `TOWNSHIP#${township}` },
      UpdateExpression: `
        SET confirmed = :t,
            consentTimestamp = :ts,
            GSI1PK = :gpk,
            GSI1SK = :gsk
        REMOVE confirmToken, #ttl
      `,
      ExpressionAttributeNames: { '#ttl': 'ttl' },  // 'ttl' is not reserved, but safe to name-alias
      ConditionExpression: 'attribute_exists(PK) AND confirmed = :f AND confirmToken = :token',
      ExpressionAttributeValues: {
        ':t': true, ':f': false,
        ':ts': new Date().toISOString(),
        ':gpk': `TOWNSHIP#${township}`,
        ':gsk': `CONFIRMED#${email}`,
        ':token': token,
      },
    }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Could be: already confirmed, expired (item deleted by TTL), wrong token
      return { statusCode: 200, body: JSON.stringify({ message: 'Al bevestigd of link verlopen' }) };
    }
    throw err;
  }

  // 302 redirect to Angular /bevestigen page
  return {
    statusCode: 302,
    headers: { Location: `${FRONTEND_URL}/bevestigen?status=ok` },
    body: '',
  };
}
```

**Why REMOVE `ttl` at confirm:** If `ttl` stays on the item, DynamoDB will delete the confirmed subscriber when the original 24 h window expires. Must REMOVE `ttl` from the item on confirm.

### GET /unsubscribe — GSI2 Lookup + Hard Delete

```typescript
async function handleUnsubscribe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { token } = event.queryStringParameters ?? {};
  if (!token) return { statusCode: 400, body: JSON.stringify({ message: 'Ongeldige link' }) };

  // Resolve PK+SK via GSI2
  const queryResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gpk',
    ExpressionAttributeValues: { ':gpk': `TOKEN#${token}` },
    Limit: 1,
  }));

  if (!queryResult.Items?.length) {
    // Token not found → already unsubscribed (item deleted) → graceful 410
    return {
      statusCode: 302,
      headers: { Location: `${FRONTEND_URL}/uitschrijven?status=already` },
      body: '',
    };
  }

  const { PK, SK } = queryResult.Items[0] as { PK: string; SK: string };
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK, SK } }));

  // 302 redirect to Angular /uitschrijven page
  return {
    statusCode: 302,
    headers: { Location: `${FRONTEND_URL}/uitschrijven?status=ok` },
    body: '',
  };
}
```

---

## Concern 3: CheckerLambda Migration

### What to Migrate vs. What to Replace

| Existing code in `src/check-availability.ts` | Migration action |
|-----------------------------------------------|-----------------|
| `getSession()` — GET rental page + POST SetProfileOption | **Port as-is** to `backend/src/shared/acv.ts`; takes `townshipId` param |
| `fetchCalendarMonth()` — GET calendar JSON | **Port as-is**; takes `cookieString` + `townshipId` + `year` + `month` |
| `getUpcomingDateRange()`, `formatDateNL()`, `normalizeTime()` | **Port as-is** |
| `buildMessage()` | **Adapt** — produce HTML + plain-text for SES, not Telegram `<pre>` format |
| `loadCache()` / `saveCache()` — file system | **Replace** with DynamoDB GetItem/PutItem (`CACHE#<id>` items) |
| `sendTelegram()` | **Replace** with `sendNotificationEmail()` via SES |
| `main()` — single township, single run | **Replace** with `handler(event)` — per-township fan-out with `Promise.allSettled` |

### Migrated `acv.ts` Module Shape

```typescript
// backend/src/shared/acv.ts
export interface CalendarDay {
  date: string;   // 'YYYY-MM-DD'
  state: 'available' | 'semi' | 'full' | 'unavailable';
  slots: string[]; // normalised time strings e.g. '08:00 - 10:00'
}

// Zod schema for ACV API response (CHK-05: parse failure → throw)
const CalendarDaySchema = z.object({
  date:    z.string(),
  state:   z.enum(['available', 'semi', 'full', 'unavailable']),
  parts:   z.array(z.object({
    id:     z.string(),
    text:   z.string(),
    status: z.enum(['available', 'disabled']),
  })).optional(),
});

const CalendarResponseSchema = z.object({
  valid:  z.literal(true),
  days:   z.array(CalendarDaySchema).min(10),  // <10 = bad session (CHK-05)
});

export async function getAvailability(townshipId: string): Promise<CalendarDay[]> {
  const cookieString = await getSession(townshipId);
  const now = new Date();
  // fetch current + next month (same as original script)
  const [curr, next] = await Promise.all([
    fetchCalendarMonth(now.getFullYear(), now.getMonth() + 1, cookieString, townshipId),
    fetchCalendarMonth(/* next month */, cookieString, townshipId),
  ]);
  return filterUpcoming([...curr, ...next]);  // 14-day window
}

// Throws on parse failure — never returns partial data (CHK-05)
async function fetchCalendarMonth(...): Promise<CalendarDay[]> {
  const res = await fetch(url, { headers: { Cookie: cookieString, ... } });
  const json = await res.json();
  const parsed = CalendarResponseSchema.parse(json); // throws ZodError on bad response
  return parsed.days
    .filter(d => d.state === 'available' || d.state === 'semi')
    .map(d => ({ date: d.date, state: d.state, slots: extractSlots(d) }));
}
```

### CheckerLambda Handler Structure

```typescript
// backend/src/checker/handler.ts
export async function handler(event: ScheduledEvent | { source?: string }): Promise<void> {
  const isDailyDigestFlush = 'source' in event && event.source === 'daily-digest-flush';

  if (isDailyDigestFlush) {
    await flushDailyDigests();
    return;
  }

  // CHK-04: only scrape townships with confirmed subscribers
  const activeTownships = await getActiveTownships();  // GSI1 distinct GSI1PK values
  if (activeTownships.length === 0) return;

  // Promise.allSettled — one township failure does not block others (CHK-05 per-township)
  const results = await Promise.allSettled(
    activeTownships.map(townshipId => processTownship(townshipId))
  );

  // Log failures without rethrowing — CheckerLambda must not fail globally on one bad township
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.error(`Township ${activeTownships[i]} failed:`, result.reason);
      // CloudWatch alarm picks this up via error log pattern
    }
  }
}

async function processTownship(townshipId: string): Promise<void> {
  // 1. Fetch live availability (throws on parse failure — does NOT write cache)
  const current = await getAvailability(townshipId);   // from acv.ts

  // 2. Load cached state from DynamoDB
  const cached = await loadCache(townshipId);

  // 3. Diff — find dates/slots not in cache
  const newSlots = diffAvailability(current, cached);

  // 4. Write updated cache (only reached if parse succeeded — CHK-05)
  await saveCache(townshipId, current);

  if (newSlots.length === 0) return;

  // 5. Query confirmed subscribers for this township
  const subscribers = await getConfirmedSubscribers(townshipId);  // GSI1 query

  // 6. Fan-out
  await Promise.allSettled(
    subscribers.map(sub =>
      sub.frequency === 'immediately'
        ? sendNotificationEmail(sub.email, sub.unsubscribeToken, townshipId, newSlots)
        : accumulateDailyDigest(sub.email, sub.unsubscribeToken, townshipId, newSlots)
    )
  );
}
```

### Cache Diff Logic

```typescript
function diffAvailability(current: CalendarDay[], cached: CachedDay[]): NewSlot[] {
  const cachedMap = new Map(cached.map(c => [c.date, new Set(c.slots)]));
  const newSlots: NewSlot[] = [];
  for (const day of current) {
    const prevSlots = cachedMap.get(day.date);
    if (!prevSlots) {
      // New date entirely
      newSlots.push({ date: day.date, state: day.state, slots: day.slots, isNew: true });
    } else {
      const addedSlots = day.slots.filter(s => !prevSlots.has(s));
      if (addedSlots.length > 0) {
        newSlots.push({ date: day.date, state: day.state, slots: addedSlots, isNew: false });
      }
    }
  }
  return newSlots;
}
```

### Getting Active Townships from GSI1

For v1 (small table), scan GSI1 and extract distinct `GSI1PK` values:

```typescript
async function getActiveTownships(): Promise<string[]> {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    ProjectionExpression: 'GSI1PK',
  }));
  const seen = new Set<string>();
  for (const item of result.Items ?? []) {
    if (item.GSI1PK) seen.add((item.GSI1PK as string).replace('TOWNSHIP#', ''));
  }
  return [...seen];
}
```

At larger scale (v2): maintain a `TOWNSHIPS` aggregate item updated on each confirm/unsubscribe.

### Daily Digest Flush (Second EventBridge Rule)

Add a second EventBridge rule in `BackendStack` targeting the same `CheckerLambda` with a constant JSON input:

```typescript
// infrastructure/lib/backend-stack.ts — add alongside existing CheckerSchedule rule
new events.Rule(this, 'DailyDigestFlush', {
  schedule: events.Schedule.cron({ hour: '8', minute: '0', weekDay: 'MON-SUN' }),
  targets: [new targets.LambdaFunction(checkerFn, {
    event: events.RuleTargetInput.fromObject({ source: 'daily-digest-flush' }),
  })],
});
```

Inside `flushDailyDigests()`: scan for all items with `PK` beginning `DIGEST#`, send aggregated email, then `DeleteItem`.

---

## Concern 4: SES Email Sending

### Client Pattern (module-level singleton — warm invocation reuse)

```typescript
// backend/src/shared/ses.ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({});  // region from AWS_REGION env var set by Lambda runtime
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS!;
const CONFIG_SET   = process.env.SES_CONFIG_SET!;
const FRONTEND_URL = process.env.FRONTEND_URL!;
```

### Sending Pattern with List-Unsubscribe Headers (RFC 8058, UNSUB-01)

```typescript
await ses.send(new SendEmailCommand({
  FromEmailAddress: FROM_ADDRESS,
  Destination: { ToAddresses: [subscriberEmail] },
  ConfigurationSetName: CONFIG_SET,
  Content: {
    Simple: {
      Subject: { Data: 'Nieuwe aanhanger-slots beschikbaar', Charset: 'UTF-8' },
      Body: {
        Html: { Data: buildNotificationHtml(slots, unsubscribeToken), Charset: 'UTF-8' },
        Text: { Data: buildNotificationText(slots, unsubscribeToken), Charset: 'UTF-8' },
      },
      Headers: [
        // RFC 8058 one-click unsubscribe (UNSUB-01)
        {
          Name: 'List-Unsubscribe',
          Value: `<${FRONTEND_URL}/uitschrijven?token=${unsubscribeToken}>, <mailto:unsubscribe@acv-aanhanger.nl?subject=unsubscribe>`,
        },
        {
          Name: 'List-Unsubscribe-Post',
          Value: 'List-Unsubscribe=One-Click',
        },
      ],
    },
  },
}));
```

> **SES v2 custom headers:** The `Headers` array is supported in `SendEmailCommand` input under `Content.Simple.Headers`. Each entry is `{ Name: string, Value: string }`. [VERIFIED: `@aws-sdk/client-sesv2@3.1053.0` — instantiated and tested locally]

### Email Templates Summary

| Template | Subject (Dutch) | Key content |
|----------|----------------|-------------|
| Confirmation | `Bevestig je aanmelding — ACV Aanhanger` | Confirm link, privacy policy link, 24 h expiry note |
| Slot notification | `Nieuwe aanhanger-slots in jouw gemeente!` | Slot table (date, state, times), ACV booking URL, unsubscribe footer |
| Daily digest | `Dagelijks overzicht — ACV aanhanger slots` | Aggregated slot table across all new slots that day, unsubscribe footer |

**Booking URL:** `https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen` (from existing script) [VERIFIED: existing `src/check-availability.ts`]

### Confirmation URL Format

```
${FRONTEND_URL}/bevestigen?token=${confirmToken}&email=${Buffer.from(email).toString('base64url')}&township=${townshipId}
```

This avoids a GSI3 — the confirm handler decodes email and township directly, then does a `GetItem` + token match + `UpdateItem`.

---

## Concern 5: GDPR Compliance

| Requirement | Implementation | Where |
|-------------|----------------|-------|
| COMP-02: consent timestamp | `consentTimestamp = new Date().toISOString()` set in `UpdateItem` at confirm | `GET /confirm` handler |
| COMP-03: hard-delete | `DeleteItem` on `GET /unsubscribe` — no status field, no archiving | `GET /unsubscribe` handler |
| Double opt-in | Subscriber is `confirmed=false` until email link clicked | `POST /subscribe` + `GET /confirm` |
| TTL on PENDING | `ttl = now + 86400s` on PENDING items; DynamoDB auto-deletes after 24 h | `POST /subscribe` + `StatefulStack.timeToLiveAttribute` |
| Single-use confirm token | REMOVE `confirmToken` from item on confirm; replay hits `ConditionalCheckFailedException` | `GET /confirm` UpdateExpression |
| Single-use unsubscribe token | After `DeleteItem`, GSI2 lookup returns empty — graceful 410/redirect | `GET /unsubscribe` |
| No soft-delete | No `status: 'unsubscribed'` field; `DeleteItem` only | `GET /unsubscribe` handler |
| SES suppression list | `AcvNotifications` ConfigurationSet with `BOUNCES_AND_COMPLAINTS` suppression (Phase 1) | `StatefulStack` (already deployed) |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DynamoDB type marshaling | Custom JSON ↔ AttributeValue conversions | `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` | Handles all DynamoDB type quirks (N, S, BOOL, L, M, NULL) |
| Token generation | Custom UUID or random-bytes implementation | `crypto.randomUUID()` (Node 22 built-in) | Cryptographically secure; no dependency |
| Conditional writes | Manual GetItem + conditional PutItem in app code | `ConditionExpression` on PutItem/UpdateItem | DB enforces atomicity; app-level check has race condition |
| Input validation | Manual regex / typeof checks | `zod` `.safeParse()` | Structured error output; TypeScript inference |
| SES DKIM/SPF | Manual DNS + SendEmail setup | CDK `EmailIdentity` + `ConfigurationSet` (Phase 1) | CDK outputs DKIM records; suppression list auto-configured |
| Cache diffing | Complex list comparison | Simple Set-based diff (`Set.has()`) | The existing `src/check-availability.ts` pattern already works |
| Email templates | Template engine (handlebars, etc.) | Inline TypeScript template functions | No dependencies; 3 small templates; easy to maintain |
| Rate limiting (v2) | In-memory Map (current v1) | DynamoDB atomic counter or ElastiCache | v1 in-memory is sufficient; upgrade path clear |

---

## Common Pitfalls

### Pitfall 1: Forgetting `timeToLiveAttribute` on the Table

**What goes wrong:** PENDING subscriber records are never deleted; table grows without bound; TTL `ttl` attribute on items does nothing.
**Why it happens:** TTL is a DynamoDB table-level setting pointing to a specific attribute name. Without it, all `ttl` attributes are ignored.
**How to avoid:** Add `timeToLiveAttribute: 'ttl'` to `StatefulStack` TableV2 definition **before first deploy**. This is the Phase 2 prerequisite.
**Warning signs:** `describe-time-to-live` returns `DISABLED` for the table.

### Pitfall 2: Not Removing `ttl` at Confirm

**What goes wrong:** Confirmed subscriber auto-expires 24 h after subscribe time even though they confirmed. Subscriber vanishes from the table silently.
**Why it happens:** TTL attribute remains on the item after `confirmed = true`.
**How to avoid:** `REMOVE #ttl` in the `UpdateExpression` of the confirm `UpdateItem` call.
**Warning signs:** Subscribers disappear from DynamoDB ~24 h after confirming.

### Pitfall 3: Writing Cache on Zod Parse Failure

**What goes wrong:** ACV returns a malformed response (e.g., `valid: false`, empty days array, session expired); the Lambda writes an empty cache; on next run it diffs empty vs. cached slots and notifies all subscribers about "all slots are gone" — or worse, detects everything as "new" when ACV recovers.
**Why it happens:** Cache write happens unconditionally after fetch.
**How to avoid:** Use `CalendarResponseSchema.parse(json)` (throws on failure, not `.safeParse()`). Only reach the `saveCache()` call if parse succeeds AND `days.length >= 10`. Let the Lambda throw — CloudWatch picks it up.
**Warning signs:** Notification emails with no slot content; cache item shows empty `slots` arrays.

### Pitfall 4: ACV Session Expiry During Long Checker Runs

**What goes wrong:** Checker Lambda processes 5+ townships. PHPSESSID acquired at start is stale by the 4th township.
**Why it happens:** ACV session likely has a short TTL server-side; the same session used for multiple townships may expire mid-run.
**How to avoid:** Acquire a new session **per township** (not once at the start of the Lambda invocation). The `getSession(townshipId)` call is inside `processTownship()`, not before the loop.
**Warning signs:** 2nd+ townships in a run return `days.length = 0` or `valid: false`.

### Pitfall 5: `externalModules: ['@aws-sdk/*']` in NodejsFunction Bundling

**What goes wrong:** Lambda throws `Cannot find module '@aws-sdk/client-dynamodb'` at runtime.
**Why it happens:** AWS SDK v3 is NOT pre-installed in Node 22 Lambda runtime (unlike v2 in Node 16). Setting `externalModules: ['@aws-sdk/*']` tells esbuild to skip bundling — the module is missing in the runtime.
**How to avoid:** The existing `backend-stack.ts` from Phase 1 correctly does NOT set `externalModules`. Do not add it.
**Warning signs:** `Runtime.ImportModuleError` in Lambda logs; `Module not found` for any `@aws-sdk/*` import.

### Pitfall 6: GSI1 Not Sparse — PENDING Items Appear in Fan-out

**What goes wrong:** CheckerLambda queries GSI1 for confirmed subscribers; PENDING (unconfirmed) subscribers also appear in the results; they receive notification emails before confirming.
**Why it happens:** `GSI1PK` and `GSI1SK` written to item at subscribe time instead of at confirm time.
**How to avoid:** Write `GSI1PK`/`GSI1SK` only in the `GET /confirm` `UpdateItem` call — never in `POST /subscribe`. GSI1 is sparse by design: items without those attributes don't appear in GSI1.
**Warning signs:** Subscribers receive notifications without having confirmed; `Query GSI1` returns items where `confirmed = false`.

### Pitfall 7: SES Sandbox Mode in Testing

**What goes wrong:** All SES sends to non-verified email addresses fail with `MessageRejected`; this looks like code bugs but is an account-level setting.
**Why it happens:** AWS accounts start in SES sandbox; SES production access must be requested manually (Phase 1 task, SLA 24–72 h).
**How to avoid:** During development, only test with addresses verified in SES console. Do not attempt to verify the end-to-end flow with unverified addresses until sandbox exit is confirmed.
**Warning signs:** `MessageRejected: Email address not verified` in Lambda logs; SES dashboard shows "Sandbox" mode.

---

## Architecture Patterns

### Pattern 1: DynamoDB Client Singleton (Lambda warm reuse)

```typescript
// backend/src/shared/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Module-level singleton — reused across warm invocations
const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client);
export const TABLE_NAME = process.env.TABLE_NAME!;
```

**Source:** [CITED: AWS Lambda best practices — reuse SDK clients across invocations]

### Pattern 2: PutItem with ConditionExpression for Subscribe

```typescript
// Subscribe — create PENDING record; throw ConditionalCheckFailedException if already exists
await ddb.send(new PutCommand({
  TableName: TABLE_NAME,
  Item: { PK, SK, confirmed: false, ... },
  ConditionExpression: 'attribute_not_exists(PK)',
}));
```

### Pattern 3: UpdateItem ConditionExpression for Confirm (SUB-09)

```typescript
await ddb.send(new UpdateCommand({
  TableName: TABLE_NAME,
  Key: { PK: `SUB#${email}`, SK: `TOWNSHIP#${township}` },
  UpdateExpression: 'SET confirmed = :t, consentTimestamp = :ts, GSI1PK = :gpk, GSI1SK = :gsk REMOVE confirmToken, #ttl',
  ConditionExpression: 'attribute_exists(PK) AND confirmed = :f AND confirmToken = :token',
  ExpressionAttributeNames: { '#ttl': 'ttl' },
  ExpressionAttributeValues: { ':t': true, ':f': false, ':ts': ..., ':gpk': ..., ':gsk': ..., ':token': token },
}));
```

### Pattern 4: QueryCommand on GSI1 for Subscriber Fan-out (NOTIF-04)

```typescript
// Get all confirmed subscribers for a township
const result = await ddb.send(new QueryCommand({
  TableName: TABLE_NAME,
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :gpk',
  ExpressionAttributeValues: { ':gpk': `TOWNSHIP#${townshipId}` },
  ProjectionExpression: 'PK, frequency, unsubscribeToken',  // email is encoded in GSI1SK
}));
// Extract email from GSI1SK = 'CONFIRMED#email'
const subscribers = (result.Items ?? []).map(item => ({
  email:            (item.GSI1SK as string).replace('CONFIRMED#', ''),
  frequency:        item.frequency as 'immediately' | 'daily',
  unsubscribeToken: item.unsubscribeToken as string,
}));
```

---

## Validation Architecture

`workflow.nyquist_validation: true` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `infrastructure/vitest.config.ts` (CDK assertions tests) |
| Quick run command | `cd infrastructure && npm test` |
| Full suite command | `cd infrastructure && npm test` |

**Note:** The backend package currently has no test runner configured. Unit tests for Lambda handlers should be added with Vitest directly in `backend/`. This is a Wave 0 gap.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command | File Exists? |
|--------|----------|-----------|---------|-------------|
| INFRA-07 | GSI1 + GSI2 in DynamoDB table | CDK Assertions | `cd infrastructure && npm test` | ✅ (todo stubs) |
| SUB-04 | Duplicate subscribe resends confirmation | Unit | `cd infrastructure && npm test` | ❌ Wave 0 |
| SUB-05 | Rate limit rejects 6th request in 60s | Unit | `cd infrastructure && npm test` | ❌ Wave 0 |
| SUB-06/07 | POST /subscribe creates PENDING + sends SES | Unit (mock SES) | `cd infrastructure && npm test` | ❌ Wave 0 |
| SUB-09 | GET /confirm uses ConditionExpression | Unit (mock DynamoDB) | `cd infrastructure && npm test` | ❌ Wave 0 |
| UNSUB-03/04 | GET /unsubscribe deletes item; replay → graceful | Unit | `cd infrastructure && npm test` | ❌ Wave 0 |
| CHK-05 | Zod parse failure → no cache write | Unit | `cd infrastructure && npm test` | ❌ Wave 0 |
| CHK-06 | Diff detects new slots correctly | Unit (pure function) | `cd infrastructure && npm test` | ❌ Wave 0 |
| CHK-01/03/04 | CheckerLambda only processes active townships | CDK Assertions + Unit | `cd infrastructure && npm test` | ❌ Wave 0 |
| NOTIF-01/02/03 | Email HTML contains slots, Dutch, unsubscribe link | Unit (template output) | `cd infrastructure && npm test` | ❌ Wave 0 |
| COMP-02 | consentTimestamp set at confirm | Unit (mock DDB) | `cd infrastructure && npm test` | ❌ Wave 0 |

### Mocking Strategy

**DynamoDB + SES in unit tests:** Use `vi.mock('@aws-sdk/lib-dynamodb')` and `vi.mock('@aws-sdk/client-sesv2')` with `vi.fn()` to intercept `.send()` calls. No DynamoDB local instance needed for unit tests — handler logic can be tested by asserting the Commands sent to the mocked client.

```typescript
// Example test setup
import { vi } from 'vitest';
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: vi.fn() }) },
  PutCommand: vi.fn(),
  GetCommand: vi.fn(),
  // ...
}));
```

**CDK Assertions tests** (already working in `infrastructure/`): Fill in `it.todo()` stubs in `backend-stack.test.ts` with `template.hasResourceProperties()` and `template.resourceCountIs()` assertions for Lambda functions, EventBridge rules, HTTP API routes.

### Sampling Rate

- **Per task commit:** `cd infrastructure && npm test` (CDK assertions — fast, < 5 s)
- **Per wave merge:** `cd infrastructure && npm test` + `cd backend && npm test` (once Wave 0 gap is filled)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `infrastructure/vitest.config.ts` — add `backend/` test directory inclusion, OR create `backend/vitest.config.ts` + `backend/test/` directory with Vitest setup
- [ ] `backend/test/api-handler.test.ts` — unit tests for subscribe/confirm/unsubscribe routes (mock DynamoDB + SES)
- [ ] `backend/test/checker-handler.test.ts` — unit tests for processTownship, diffAvailability (pure function, no mocks needed)
- [ ] `backend/test/acv.test.ts` — Zod schema parsing tests: valid response passes, `valid=false` throws, `days.length < 10` throws
- [ ] Fill in `it.todo()` in `infrastructure/test/backend-stack.test.ts` — assert EventBridge rule rate, HTTP API routes, Lambda ARM64 + Node 22 config
- [ ] Fill in `it.todo()` in `infrastructure/test/stateful-stack.test.ts` — assert GSI1/GSI2 presence, RETAIN removal policy, `timeToLiveAttribute`

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` — section required.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — no user login; email tokens are not session auth | — |
| V3 Session Management | No — stateless Lambda; no user sessions | — |
| V4 Access Control | Partial — subscription ops keyed by email+token | Single-use token enforcement via ConditionExpression |
| V5 Input Validation | **Yes** | `zod` `.safeParse()` / `.parse()` at handler entry for all API inputs |
| V6 Cryptography | **Yes** — tokens | `crypto.randomUUID()` (CSPRNG, built-in Node 22) — never hand-roll |
| V7 Error Handling | **Yes** | No stack traces in API responses; all errors caught and mapped to 4xx/5xx |
| V9 Communications | **Yes** — HTTPS only | API Gateway + SES both TLS-only |
| V14 Configuration | **Yes** | No secrets in code; all config via Lambda env vars from CDK stack outputs |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Email enumeration via subscribe response | Information Disclosure | POST /subscribe always returns 202/200 regardless of whether email exists (SUB-04 silent duplicate) |
| Confirm token brute-force | Spoofing | UUID v4 = 2^122 entropy; rate-limit applies to POST /subscribe (token source), not confirm |
| Unsubscribe token replay | Spoofing | DeleteItem removes item; GSI2 returns empty on replay → graceful 410 |
| Notification email injection | Tampering | All slot content comes from ACV API; Zod validates response shape; HTML is template-built, not string-concatenated from user input |
| Lambda environment variable leakage | Information Disclosure | Env vars set via CDK from stack outputs; no secrets hardcoded in code |
| SES sending to unverified addresses (sandbox) | Availability | Document sandbox limitation; test only with verified addresses until production access approved |
| ACV scraper over-triggering (EventBridge stuck) | DoS on ACV | `Promise.allSettled` limits to one invocation/10 min; no recursive triggering |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Lambda runtime (local typecheck) | ✓ | 22.x (inferred from `@types/node@^22`) | — |
| AWS CLI / CDK | Deploy Lambda + DynamoDB | ? | Not confirmed (credentials not set up) | Defer deploy to user-with-creds step |
| DynamoDB (AWS) | Integration testing | ✗ | Not deployed yet | Unit test with mocked SDK client; integration test post-deploy |
| SES (AWS) | Email send testing | ✗ | Not deployed yet; sandbox mode | Test with verified email addresses only until sandbox exit |
| `npx tsc --noEmit` | Type checking backend | ✓ | TypeScript 5.8.x in backend devDeps | — |
| `vitest` in infra | CDK Assertions tests | ✓ | 4.1.7 | — |

**Missing dependencies with no fallback:** None that block code implementation. AWS deploy deferred to user step.

**Missing dependencies with fallback:** DynamoDB and SES — all Lambda unit tests mock the SDK; integration tests require post-deploy.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ACV session established per `getSession(townshipId)` remains valid for the duration of one township's calendar fetch (two `fetchCalendarMonth` calls) | CheckerLambda migration | Session expires between calls → both months return empty → parse fails → no cache write (safe, but township skipped); re-scrape on next 10-min tick |
| A2 | The `Headers` array under `Content.Simple.Headers` in `SendEmailCommand` is supported by `@aws-sdk/client-sesv2@3.1053.0` | SES email sending | List-Unsubscribe headers silently dropped; RFC 8058 compliance not met → must add headers via raw MIME (`RawMessage`) instead |
| A3 | DynamoDB GSI1 `nonKeyAttributes: ['confirmed', 'frequency']` projection (from Phase 1 StatefulStack) is sufficient to retrieve `frequency` and `unsubscribeToken` from the GSI1 query | CheckerLambda fan-out | `unsubscribeToken` is NOT in GSI1 projection → must add it to `nonKeyAttributes` in StatefulStack or do a second GetItem per subscriber |
| A4 | ACV `PRODUCT=2` and `SITE=1` constants remain correct for trailer bookings at all township locations | acv.ts migration | ACV API returns data for a different product or site; wrong results diffed against cache → spurious notifications |

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| `Table` (CDK v1 legacy) | `TableV2` | Phase 1 already uses `TableV2` correctly |
| `@aws-sdk/client-ses` (SES v1) | `@aws-sdk/client-sesv2` (SES v2) | Phase 1 already uses v2 |
| `NODEJS_LATEST` runtime | `NODEJS_22_X` pinned | Phase 1 already pins to `NODEJS_22_X` |
| Zod v3 `.z.string().email()` | Zod v4 `z.email()` | Both work in v4; prefer standalone form |
| File-based availability cache | DynamoDB per-township cache | This phase: migrate from `availability_cache.json` to `CACHE#<id>` items |
| Single-township env var | GSI1 fan-out for active townships | This phase: `Promise.allSettled` loop over confirmed townships |

---

## Sources

### Primary (HIGH confidence)

- `backend/package.json` + local `node -e` verification — all package APIs confirmed against installed versions
- `infrastructure/lib/stateful-stack.ts` — DynamoDB GSI1/GSI2 exact attribute names (PK=`PK`, SK=`SK`, `GSI1PK`, `GSI1SK`, `GSI2PK`) confirmed from Phase 1 code
- `infrastructure/lib/backend-stack.ts` — Lambda env vars, bundling config, HTTP API routes confirmed from Phase 1 code
- `src/check-availability.ts` — session auth flow, calendar fetch, diff logic, URL constants confirmed
- `.planning/research/ARCHITECTURE.md` — DynamoDB table design, item shapes, GSI design, flow diagrams
- `.planning/research/STACK.md` — package versions, NodejsFunction bundling note (do not externalize SDK), SES v2 pattern

### Secondary (MEDIUM confidence)

- [CITED: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html] — `timeToLiveAttribute` table setting
- [CITED: https://docs.aws.amazon.com/ses/latest/dg/sending-email-list-management.html] — RFC 8058 `List-Unsubscribe` header support in SES v2
- [CITED: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html] — SDK client singleton pattern for warm reuse

### Tertiary (LOW confidence — [ASSUMED])

- A2 (SES custom Headers API shape) — verified via local SDK instantiation test but not against SES service response; if headers are silently ignored, raw MIME approach is fallback [ASSUMED]
- A3 (GSI1 projection covers `unsubscribeToken`) — GSI1 projection currently includes `confirmed` and `frequency` but NOT `unsubscribeToken`; plan must add `unsubscribeToken` to `nonKeyAttributes` or do secondary GetItem [ASSUMED → **action required in Plan 02-01**]

---

## Open Questions

1. **GSI1 projection missing `unsubscribeToken`**
   - What we know: Phase 1 `StatefulStack` GSI1 `nonKeyAttributes: ['confirmed', 'frequency']` — `unsubscribeToken` is absent
   - What's unclear: Is `unsubscribeToken` derivable from GSI1 result without a second GetItem?
   - **Recommendation:** Add `unsubscribeToken` to GSI1 `nonKeyAttributes` in the StatefulStack patch (Plan 02-01). This is a CDK-only change that requires a stack update, not a data migration.

2. **SES `Content.Simple.Headers` API availability**
   - What we know: `SendEmailCommand` input accepts `Headers` array under `Content.Simple`; SDK instantiation succeeded locally
   - What's unclear: Whether this is actually transmitted by SES or silently dropped; hard to verify without real SES access
   - **Recommendation:** Implement with `Headers` array first. If emails arrive without `List-Unsubscribe` headers after first SES sandbox test, fall back to `RawMessage` with full MIME construction.

3. **Digest flush scan approach**
   - What we know: `DIGEST#` items need to be found for daily flush; full-table Scan with filter is O(table-size) cost
   - What's unclear: Whether v1 scale (< 100 subscribers) justifies a dedicated GSI3 now
   - **Recommendation:** Use Scan with filter for v1 (cost < $0.01/month at this scale). Note in Plan 02-03 as a v2 upgrade path.

---

## Metadata

**Confidence breakdown:**

- DynamoDB schema + access patterns: HIGH — drawn from confirmed Phase 1 code + ARCHITECTURE.md
- Lambda handler patterns: HIGH — zod v4 and SDK v3 verified against locally installed packages
- SES List-Unsubscribe headers: MEDIUM — SDK instantiation confirmed; SES service behavior unverified without live account
- CheckerLambda migration: HIGH — source code of `src/check-availability.ts` fully reviewed
- GDPR / compliance: HIGH — hard-delete + TTL patterns well-understood; consent timestamp straightforward

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable AWS SDK; CDK 2.x minor versions)
