# Domain Pitfalls

**Domain:** Web-scraping availability notifier with public email subscription (AWS serverless)
**Project:** ACV Aanhanger Beschikbaarheid
**Researched:** 2025-05-25
**Confidence:** HIGH (SES/DynamoDB), MEDIUM (scraping fragility), HIGH (GDPR basics)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or regulatory exposure.

---

### Pitfall 1: ACV Session Acquisition — Silent Failure Returns Bad Data

**What goes wrong:**
The scraper performs a two-step session dance: `GET` the rental page to obtain `PHPSESSID`, then `POST` to `SetProfileOption` to bind the township and get `visitor_id`. If either step silently "succeeds" (HTTP 200) but returns stale or wrong data, the calendar endpoint returns `valid: false` or an empty day list — which the current code handles by returning `[]` and logging a warning. In a serverless context with no human watching logs, this silently marks no new slots and updates the cache with an empty state, **causing false negatives: real slot openings are missed**.

**Why it happens:**
- ACV may change session cookie names or require additional cookies
- `SetProfileOption` can return `{ success: false }` silently
- The calendar may return `valid: false` if the session has no township bound
- Network hiccups cause fetch to succeed but return empty body

**Consequences:**
- Cache is overwritten with empty state — next run sees "no new slots" even after availability returns
- Subscribers never get notified of actual openings

**Prevention:**
- Treat `valid: false` from the calendar as a **hard failure**, not a warning — throw, let Lambda fail, trigger CloudWatch alarm
- Treat empty `days[]` for a month as suspicious — compare against expected range (current + next month should always have days)
- Add a canary assertion: if fetched `days.length < 10` for any non-holiday month, treat as scrape failure
- **Never save cache after a scrape failure** — preserve the previous state so next run can still diff correctly
- Use Lambda DLQ + CloudWatch alarm on Lambda errors to get notified on scrape failures

**Detection:** CloudWatch `Errors` metric on the checker Lambda, plus a custom metric for `scrape_failure` events. Alert if Lambda errors > 0 in any 30-minute window.

---

### Pitfall 2: ACV Site Structural Changes Break the Scraper Without Warning

**What goes wrong:**
ACV Groep has no public API SLA. The calendar endpoint (`/ajax/RentalProducts/getCalendar`), the `SetProfileOption` path, and the JSON response shape (`valid`, `days`, `parts`, `state` values) are all internal implementation details that can change in any website update. Changes may:
- Rename/remove `PHPSESSID` or `visitor_id` cookie fields
- Change `state` enum values (`available`/`semi`/`full`/`unavailable`)
- Restructure `parts[]` or remove it entirely
- Move endpoints to a new path or require CSRF tokens

**Why it happens:** ACV is a regional utility website, not an API-first product. Frontend deployments happen without notice.

**Consequences:** Complete scraper breakdown. If undetected, subscribers receive no notifications indefinitely.

**Prevention:**
- Parse the response defensively: validate that `data.valid === true` AND `data.days.length > 0` before processing
- Add a schema validation step (zod or manual) on the calendar response shape — fail loudly if shape changes
- Log the raw response (first 500 chars) on any parse error for post-mortem debugging
- Set up a weekly CloudWatch alarm: "if Lambda ran 0 times in 7 days with 0 notifications AND subscriber count > 0, alert"
- Consider a health-check Lambda that runs once daily and asserts the session can be established

**Detection:** Lambda error rate alarm + response shape validation errors in logs.

---

### Pitfall 3: SES Sandbox — Emails Silently Disappear During Development

**What goes wrong:**
New AWS accounts start in SES sandbox mode. In sandbox:
- You can **only send to verified email addresses** (individually verified, one by one)
- Maximum 200 emails/24 hours, 1 email/second sending rate
- **Production opt-in requires a support request** that can take 24–72 hours to approve

If you deploy the full subscription + notification system without first moving to production SES, confirmation emails and notification emails sent to real subscriber addresses will be **rejected silently** (or with an obscure error), and subscribers will never receive emails.

**Why it happens:** AWS ships SES in sandbox by default to prevent spam abuse. The CDK stack can deploy successfully, endpoints can accept subscriptions, but SES rejects outbound sends.

**Consequences:**
- Double opt-in confirmation emails never arrive → subscriptions can never be confirmed
- Real slot notifications are silently dropped
- Subscriber frustration and trust damage

**Prevention:**
- File the SES production access request **in Phase 1 of infrastructure setup**, not after the app is built — approval has a SLA of its own
- In the SES production request, specify: transactional emails only, double opt-in model, subscriber consent mechanism, estimated volume (100–1000/month for this use case)
- During development, verify 2–3 test email addresses and use only those for integration tests
- Use the SES mailbox simulator for bounce/complaint testing: `bounce@simulator.amazonses.com`, `complaint@simulator.amazonses.com`
- Add a CDK context variable `SES_SANDBOX=true` that prevents the subscription Lambda from being invoked in tests without verified recipients

**Detection:** SES `SendEmail` API will throw `MessageRejected` with message "Email address is not verified" — catch this and log it as an alarm, not just a console warning.

---

### Pitfall 4: SES Bounce/Complaint Rate Triggers Account Suspension

**What goes wrong:**
AWS will **automatically suspend SES sending** if:
- Bounce rate exceeds **5%** (hard bounces)
- Complaint rate exceeds **0.1%**

For this project: if users subscribe with typos in their email addresses, or mark notification emails as spam, the account can hit suspension even at low volumes.

**Why it happens:** SES enforces strict deliverability standards to protect shared IP reputation. The suspension is automatic, not manual.

**Consequences:**
- All outbound email from the AWS account stops (affects every SES-using service in the account)
- Reinstatement requires a support case

**Prevention:**
- **Enable account-level suppression list** immediately: `aws sesv2 put-account-suppression-attributes --suppressed-reasons BOUNCE COMPLAINT`
- Double opt-in flow (which is already planned) dramatically reduces bounce rate by ensuring valid, reachable addresses
- Include `List-Unsubscribe` and `List-Unsubscribe-Post` headers in **every** notification email — this satisfies Gmail's one-click unsubscribe requirement and reduces complaint rates
- Monitor the SES reputation dashboard (Bounce rate, Complaint rate) — add a CloudWatch alarm if bounce rate > 2% or complaint rate > 0.05%
- Store and honor the suppression list: after a bounce, remove the email from active subscribers in DynamoDB

**Detection:** SES Reputation Dashboard in AWS Console + CloudWatch metrics `Bounce` and `Complaint` on SES namespace.

---

### Pitfall 5: DKIM/Domain Verification Takes Time and Blocks Launch

**What goes wrong:**
SES requires DNS propagation for:
- **Domain identity verification** (TXT record) — can take up to 72 hours
- **DKIM** (three CNAME records for Easy DKIM / RSA-2048) — separate propagation
- **Custom MAIL FROM domain** (MX + TXT records) — optional but improves deliverability

If these aren't configured before the first send attempt, emails either fail or land in spam.

**Why it happens:** DNS propagation is outside AWS control. CDK can create the SES identity resource, but CDK `deploy` will succeed even if DNS isn't propagated yet — the verification status is async.

**Consequences:**
- Emails fail to send or are flagged as unauthenticated
- Gmail/Outlook may reject or spam-folder all messages

**Prevention:**
- Plan DNS verification as a **day-one infrastructure task**, not a last step
- CDK's `aws-ses` construct can output the DKIM CNAME records — capture them and add to DNS immediately on first deploy
- Add a post-deploy check script that polls `aws sesv2 get-email-identity --email-identity yourdomain.com` until `VerificationStatus === "SUCCESS"` and `DkimStatus === "SUCCESS"` before marking infra as ready
- Use a subdomain for SES (e.g., `mail.yourdomain.nl`) to isolate reputation from main domain

---

### Pitfall 6: DynamoDB Double Opt-In Race Condition

**What goes wrong:**
Classic double opt-in race: user submits subscription form → API creates a `PENDING` item in DynamoDB → confirmation email sent → user clicks link → API marks item `CONFIRMED`. If the user clicks the confirmation link **twice** (impatient double-click, email client pre-fetching) both requests arrive simultaneously at the confirmation Lambda, both read `PENDING`, both write `CONFIRMED` — no data corruption but wasted work. More dangerous: if the confirmation URL is re-used or guessed, a replay attack is possible.

**Why it happens:**
- Stateless Lambda invocations have no locking mechanism
- DynamoDB `UpdateItem` without a condition can overwrite regardless of current state

**Prevention:**
- Use a **DynamoDB conditional write** on confirmation: `ConditionExpression: "attribute_exists(pk) AND #status = :pending"` — only the first confirmation succeeds; subsequent calls get `ConditionalCheckFailedException` (return 200 to avoid leaking info, or 409 idempotently)
- Use a **cryptographically random token** (UUID v4 or 32-byte hex) as the confirmation token — not based on email or timestamp
- Set a **TTL on PENDING items** (e.g., 24 hours) — unconfirmed subscriptions auto-expire in DynamoDB
- Rate-limit the subscribe endpoint (see Pitfall 9 below) to prevent spam-bombing the confirmation flow

**Detection:** Log `ConditionalCheckFailedException` as a metric — a spike indicates replay attempts.

---

### Pitfall 7: Lambda Cold Starts Causing Session Acquisition Timeouts

**What goes wrong:**
The scraper Lambda runs on a schedule (every 15–30 minutes). Lambda cold starts add 200–800ms before execution. The scraper makes 3 sequential HTTP requests to ACV:
1. `GET` rental page (establishes session)
2. `POST` SetProfileOption (binds township)
3. `GET` calendar (one per subscribed township, potentially parallel)

If Lambda's default timeout is too short (e.g., 10s), and ACV's servers are slow during European business hours, the function times out mid-execution — leaving the cache in a partially-updated state.

**More importantly:** Lambda's outbound IP address changes on cold start. If ACV ever implements IP-based rate limiting or bot detection, a Lambda that re-IP'd may get blocked immediately.

**Why it happens:** Lambda doesn't maintain persistent connections between invocations. Each invocation is isolated.

**Consequences:**
- Partial cache writes (some townships updated, some not) → inconsistent diffs
- ACV session abandoned mid-flight (no cleanup needed, just wasted work)
- If ACV adds bot detection: Lambda IPs from AWS IP ranges are easily identified

**Prevention:**
- Set Lambda timeout to **30 seconds** minimum (generous for scraping operations)
- Set a per-township fetch timeout of 8 seconds with explicit `AbortController` — fail fast per-township rather than hanging
- Run each township as a **separate Lambda invocation** (or at least separate session acquisition) — isolate failures
- Use **Provisioned Concurrency** only if cold start latency becomes a real problem (probably not needed at this scale)
- On `SetProfileOption` failure or session failure: **throw immediately, do not update cache**
- Add `User-Agent` rotation or a realistic browser UA — current UA is already good (Chrome/124 on Linux)

**Detection:** CloudWatch `Duration` metric for the checker Lambda + `Timeout` errors.

---

## Moderate Pitfalls

---

### Pitfall 8: Per-Township Cache Keying in DynamoDB

**What goes wrong:**
The existing code uses a single `availability_cache.json` keyed by date. In DynamoDB, the cache must be keyed by **township + date**. If the partition key design is wrong (e.g., `pk = date`, `sk = township`), hot-partition issues arise when many townships have the same busy dates, and queries become expensive.

**Prevention:**
- Use `pk = "CACHE#<townshipId>"` as partition key, `sk = "<date>"` as sort key — one partition per township, date as range
- This gives O(1) range queries per township and avoids hot partitions
- Keep DynamoDB table for subscribers and cache in **the same table** (single-table design) using pk prefixes: `SUBSCRIBER#<email>` for subscribers, `CACHE#<township>` for availability cache

---

### Pitfall 9: Subscribe Endpoint Abuse — Email Bombing and Bot Subscriptions

**What goes wrong:**
The public subscribe form has no auth. A bot can POST thousands of email addresses, triggering thousands of confirmation emails via SES. This:
- Exhausts your SES sending quota (200/day in sandbox, limited in production)
- Triggers SES reputation issues if target emails bounce
- Could be used as an email bombing weapon against third parties

**Why it happens:** The endpoint is public, no cost to abuse.

**Prevention:**
- Add **honeypot field** in Angular form (hidden input that real users never fill; bots often do)
- Add **rate limiting** in API Gateway: 5 requests/IP/minute using a Usage Plan or Lambda throttle
- Add a **per-email cooldown** in DynamoDB: `ConditionExpression: attribute_not_exists(pk) OR #createdAt < :cooldownTime` — reject re-subscribe within 5 minutes of a pending confirmation
- **Do not confirm email addresses are "valid"** in the subscribe response — always return "if this address exists, a confirmation email has been sent" (prevents email enumeration)
- Consider adding reCAPTCHA v3 (invisible) to the Angular form for low-friction bot protection

---

### Pitfall 10: GDPR / AVG — Email Address Storage Compliance (Dutch Law)

**What goes wrong:**
Storing subscriber email addresses + township in DynamoDB is personal data processing under GDPR (AVG in the Netherlands). Without proper measures:
- No legal basis for processing (need explicit consent + purpose limitation)
- No right to erasure implementation
- No data retention limits
- No privacy notice

**Why it happens:** Developers often focus on technical correctness and skip legal requirements.

**Consequences:**
- Regulatory risk under AVG (fines up to 4% of global turnover, though enforcement on hobby projects is rare, the obligation exists)
- User trust issues

**Prevention:**
- **Consent capture**: the subscribe form must include explicit, unbundled consent ("I agree to receive email notifications about trailer availability. I can unsubscribe at any time.") — log the consent timestamp in DynamoDB
- **Purpose limitation**: only use email addresses for trailer availability notifications — no marketing, no sharing
- **Retention**: implement TTL or scheduled cleanup for unsubscribed/inactive records (e.g., delete after 12 months of inactivity or immediately on unsubscribe)
- **Right to erasure**: the unsubscribe flow should hard-delete the subscriber record (or at minimum soft-delete with a scheduled purge), not just set `status = UNSUBSCRIBED`
- **Privacy notice**: add a minimal privacy notice page (or inline text) linked from the subscribe form
- **Data minimization**: store only email + township + consent timestamp + confirmed status — nothing else
- **Breach notification**: SES/DynamoDB are AWS-managed; AWS is a GDPR-compliant processor, but you must document this in a processing record

---

### Pitfall 11: Angular 21+ Signals — `effect()` Misuse Causing Infinite Loops

**What goes wrong:**
Angular signals `effect()` tracks all signals read inside it. Writing to a signal inside an effect that also reads that signal creates an infinite loop. This is a common gotcha for developers coming from RxJS `BehaviorSubject` patterns where you might `pipe(tap(() => subject.next(...)))` without triggering re-subscription.

Also: `effect()` runs **asynchronously** during change detection, not synchronously. Code that assumes synchronous side-effect execution (e.g., "immediately fetch after form change") will behave differently with effects vs. RxJS `switchMap`.

**Why it happens:** Mental model mismatch — Angular signals effects are closer to MobX reactions than RxJS pipes.

**Prevention:**
- Never write to a signal inside an `effect()` that reads that same signal — use `computed()` for derived state instead
- If you must write inside an effect, use `untracked(() => mySignal.set(...))` to break the tracking chain
- For async operations triggered by signal changes, use `resource()` or `rxResource()` from `@angular/core/rxjs-interop` — they handle loading/error states automatically
- Register effect cleanup with `onCleanup` when effects start async operations (timers, HTTP calls) to cancel on re-run
- For subscribe form: use `computed()` for form validity, `resource()` for the township list API call — avoid `effect()` for data fetching

**Detection:** Angular in dev mode throws `NG0600: Writing to signals in reactive contexts is not allowed` for circular writes — enable strict signal debugging in dev.

---

### Pitfall 12: CloudFront Cache Invalidation Pitfall on SPA Deployment

**What goes wrong:**
If CloudFront serves the Angular SPA from an S3 bucket with aggressive caching, re-deploying the app (new `main.js` hash) doesn't automatically invalidate the CloudFront edge cache. Users can be served stale HTML that references non-existent JS bundle hashes, causing blank-page errors for hours.

**Why it happens:** CDK's `BucketDeployment` construct has a `distributionPathsToInvalidate` option, but it's easy to miss or misconfigure.

**Prevention:**
- Always add `distributionPathsToInvalidate: ['/*']` to `BucketDeployment` in CDK
- Cache Angular's hashed asset files (`main.<hash>.js`) with long TTL (1 year), but cache `index.html` with `Cache-Control: no-cache` — this lets the browser always fetch fresh HTML while caching compiled assets
- Add a post-deploy health check that fetches the CloudFront URL and asserts the returned HTML references the expected asset hash

---

## Minor Pitfalls

---

### Pitfall 13: CDK Bootstrap — First Deploy Requires Extra Steps

**What goes wrong:**
`cdk deploy` fails on a fresh AWS account with `Error: This stack uses assets, so the toolkit stack must be deployed to the environment`. CDK bootstrap must be run first: `cdk bootstrap aws://<account>/<region>`. This is a one-time operation but catches first-time CDK users by surprise.

**Prevention:**
- Document bootstrap as a prerequisite step in the project README
- Add to CDK stack README: "Run `cdk bootstrap` once before first deploy"
- The bootstrap stack creates an S3 bucket for assets and an ECR repo — these have small ongoing costs (~$0.02/month), document this

---

### Pitfall 14: DynamoDB Billing Mode Gotcha

**What goes wrong:**
DynamoDB defaults to **provisioned throughput** in CDK (`billingMode: BillingMode.PROVISIONED`). For a low-traffic subscription app, provisioned capacity with autoscaling is complex and has a minimum charge. On-demand (`PAY_PER_REQUEST`) is simpler and cheaper at low/variable traffic.

**Prevention:**
- Explicitly set `billingMode: BillingMode.PAY_PER_REQUEST` in CDK for both the subscribers table and the cache — no capacity planning needed, scales to zero cost when idle

---

### Pitfall 15: SES Unsubscribe Token Leakage via Email Client Pre-fetchers

**What goes wrong:**
Email clients (Gmail, Apple Mail) pre-fetch links in emails to generate previews. If your unsubscribe URL is a simple `GET /unsubscribe?token=<token>`, the email client may trigger the unsubscribe **automatically** before the user ever clicks it.

**Prevention:**
- Make unsubscribe a **two-step process**: `GET /unsubscribe?token=X` shows a confirmation page ("Are you sure?"), `POST /unsubscribe` with the token actually unsubscribes
- This also satisfies RFC 8058 (`List-Unsubscribe-Post` header) for one-click unsubscribe — use `POST` not `GET` for the actual action

---

### Pitfall 16: Lambda Environment Variable Secrets Exposure

**What goes wrong:**
Lambda environment variables are stored in plaintext in the function configuration and visible in the AWS Console to anyone with `lambda:GetFunction` IAM permission. Storing SES credentials or DynamoDB table ARNs as env vars is fine; storing API keys or webhook secrets as plaintext env vars is a risk.

**Prevention:**
- For this project: Lambda uses IAM roles for SES and DynamoDB access (no API keys needed) — this is the correct pattern
- If any secret is needed (e.g., a webhook token for future admin access), store in **AWS Secrets Manager** or **Parameter Store (SecureString)** and fetch at Lambda startup with caching

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| SES setup | Sandbox blocks all non-verified sends | File production access request on day 1 of infra phase |
| SES setup | DKIM DNS propagation delays | Add DNS records and wait before testing sends |
| Scraper Lambda | Silent scrape failure → empty cache | Validate response shape; throw on `valid:false`; never save empty cache |
| Scraper Lambda | Partial township update on timeout | Isolate each township's scrape; timeout per township independently |
| DynamoDB subscribe | Race condition on double-click confirm | Conditional write with `status = PENDING` check |
| DynamoDB subscribe | Bot abuse → SES quota exhaustion | Rate limit subscribe endpoint; per-email cooldown in DDB |
| DynamoDB subscribe | GDPR/AVG consent not captured | Store consent timestamp; implement hard-delete on unsubscribe |
| Angular SPA | Effect infinite loop with signals | Use `computed()` for derived state, `resource()` for async |
| Angular SPA | Stale RxJS mental model applied to signals | Review Angular 21 signals guide; use `untracked()` for escaping reactivity |
| CDK deploy | First-time bootstrap missing | Document and script `cdk bootstrap` as prerequisite |
| CDK deploy | CloudFront stale cache after redeploy | Add `distributionPathsToInvalidate: ['/*']` to BucketDeployment |
| SES emails | One-click unsubscribe pre-fetched by email client | Two-step unsubscribe: GET shows confirm page, POST performs action |
| SES emails | Bounce/complaint rate hits suspension threshold | Enable suppression list; monitor SES reputation dashboard from day 1 |

---

## Sources

- Amazon SES Sandbox and Production: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html (HIGH confidence — official)
- SES Bounce/Complaint Suppression List: https://docs.aws.amazon.com/ses/latest/dg/lists-and-subscriptions.md (HIGH confidence — official)
- SES List-Unsubscribe Headers: https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html (HIGH confidence — official)
- SES Sending Quota (sandbox 200/day, 1/s): verified via Context7 `GetSendQuota` response schema (HIGH confidence)
- Angular Signals Effect Cleanup: https://angular.dev/guide/signals/effect (HIGH confidence — official)
- Angular Computed Signals Read-Only Guarantee: https://angular.dev/guide/signals (HIGH confidence — official)
- DynamoDB Conditional Writes: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html (HIGH confidence — official)
- GDPR/AVG Article 6 (legal basis), Article 17 (right to erasure): https://gdpr-info.eu/ (HIGH confidence — regulation text)
- ACV scraping fragility: MEDIUM confidence — based on code analysis of existing scraper + general knowledge of PHP session-based sites
- Lambda cold start durations (200–800ms for Node.js): MEDIUM confidence — community benchmarks, Lambda behavior well-documented
