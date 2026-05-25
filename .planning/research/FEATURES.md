# Feature Landscape

**Domain:** Email subscription notification service (trailer rental availability)
**Project:** ACV Aanhanger Beschikbaarheid
**Researched:** 2025-05-26
**Confidence:** HIGH (core flows verified against official AWS SES docs and RFC standards)

---

## Table Stakes

Features users expect or regulators require. Missing any of these = broken product or legal risk.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Subscribe form** (email + township) | Entry point to the product | Low | Email field + township dropdown; Angular reactive form with validation |
| **Client-side email format validation** | Immediate feedback; reduces obviously invalid submissions | Low | Standard RFC 5322 format check in Angular |
| **Double opt-in confirmation email** | (1) AWS SES best-practice requirement for sender reputation; (2) GDPR lawful-basis for consent; (3) prevents typo-bounces and malicious subscriptions | Medium | Send confirmation link on subscribe; mark subscriber `PENDING` until link clicked. Token must expire (24h TTL recommended). SES `SendCustomVerificationEmail` API or DIY Lambda confirm endpoint both work. |
| **Confirmation landing page** | User needs feedback that opt-in succeeded | Low | Simple Angular route: `/confirm?token=…` → Lambda verifies token → marks `CONFIRMED` → shows success message |
| **Duplicate subscription guard** | Re-submitting same email+township must be safe and not spam user | Low | If `PENDING`: resend confirmation (with cooldown). If `CONFIRMED`: return success silently. Never create duplicate DynamoDB record. |
| **Reject role/alias addresses** | `postmaster@`, `abuse@`, `noc@` — can be maliciously added; harm sender reputation | Low | Server-side blocklist check. Per AWS SES best practices these aliases should never receive marketing mail. |
| **Diff-based notification** (only new slots) | Users expect notifications only when *new* slots appear, not repeats | Medium | Already built in existing checker — per-township cache in DynamoDB keyed by `township#date`, compare current vs previous run |
| **Notification email with slot details** | User needs to know *which* dates/times became available to act quickly | Low | Email body lists new dates with `available`/`semi` status, links directly to ACV booking page |
| **Unsubscribe link in every email** | CAN-SPAM legal requirement; GDPR right to erasure; Google/Yahoo bulk sender requirement (RFC 8058 one-click) | Low | Use SES `ListManagementOptions` with `{{amazonSESUnsubscribeUrl}}` placeholder OR build custom signed token link. Either way: `List-Unsubscribe` + `List-Unsubscribe-Post` headers required for bulk sender compliance. |
| **Unsubscribe confirmation page** | User must see confirmation that they were removed | Low | Angular route: `/unsubscribe?token=…` → Lambda deletes/flags record → success page |
| **Instant unsubscribe processing** | GDPR: right to erasure must be honored; Gmail/Yahoo enforce one-click unsubscribe within seconds | Low | Lambda processes the unsubscribe synchronously, not batched |
| **SES account-level suppression list** | Hard bounces and spam complaints must never be re-attempted; AWS will penalize your sender reputation if bounce rate > 5% | Low | Enable account-level suppression in SES (already on by default for accounts created after Nov 2019) — bounced/complained addresses are auto-suppressed |
| **Subscribe API rate limiting** | Prevents abuse: one actor bulk-subscribing thousands of fake addresses | Medium | API Gateway throttling (e.g., 5 req/IP/min) + per-email cooldown (e.g., don't resend confirmation more than once per 10 min) |
| **Confirmation token expiry** | Tokens left forever are a security risk; expired tokens need friendly error | Low | 24h TTL on token (DynamoDB TTL attribute works well). Expired: show "link expired, subscribe again" page. |
| **SPF / DKIM / DMARC authentication** | Email clients reject or spam-folder unauthenticated mail; required for deliverability | Low | SES Easy DKIM handles DKIM automatically. SPF: add SES sending domain to SPF record. DMARC: add DNS TXT record. One-time setup in CDK. |
| **No-reply sender with reply-to set** | Transactional notification — users shouldn't reply to the sending address; but they need *a* way to contact if needed | Low | `From: noreply@yourdomain.com`, `Reply-To: support@yourdomain.com` (or just an info address). Avoid sending FROM a no-reply without reply-to — per AWS best practices. |

---

## Differentiators

Nice-to-have features. Not expected by default, but add meaningful value. Good candidates for v2+.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Direct deep-link to ACV booking** in email | User can click straight to the calendar without hunting | Low | ACV URL with township pre-selected. Investigate if ACV URLs are stable/bookmarkable. |
| **Multi-township subscription** | Power users who live near borders or have flexibility | Medium | DynamoDB model: one row per email+township pair already supports this. UI would show checkbox list instead of single dropdown. |
| **Subscription expiry with re-confirmation prompt** | Reduces stale subscriber list; improves deliverability metrics | Medium | After N months (e.g., 6), send "still interested?" email. Auto-remove if no response within 7 days. |
| **"How many others are waiting" badge** | Social proof on the subscribe form: "47 people subscribed for Ede" | Low | Aggregate count query from DynamoDB at subscribe page load. Not personally identifiable. |
| **Email open tracking** | Know if notifications are being read vs ignored | Medium | SES click/open tracking via configuration set + SNS/SQS. Use to identify dead subscribers. |
| **Quiet hours / digest batching** | If many slots open at once, batch into one email instead of multiple | Medium | Track last-sent-at per subscriber, min interval (e.g., 1h). Reduces email noise for the user. |
| **Plain-text fallback email** | Some clients prefer plain text; improves accessibility | Low | SES supports multipart/alternative with HTML + text body. Minimal effort if done from the start. |
| **"Manage my subscription" self-service link** | Let user update township without unsubscribing and re-subscribing | High | Requires authenticated magic-link flow, not trivial. Post-v1. |
| **Admin observability** | See subscriber counts, bounce rates, notification logs | High | Full admin panel is out of scope v1. CloudWatch metrics via SES configuration sets cover minimum viable observability. |

---

## Anti-Features

Things to deliberately NOT build in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **User accounts / login** | No requirement; adds auth complexity (Cognito etc.); email-based flow is sufficient | Token-based unsubscribe in email link |
| **User dashboard** (manage subscriptions in browser) | Scope creep; requires authenticated session management | Unsubscribe link + re-subscribe via form covers 95% of users |
| **Admin panel** (view all subscribers, trigger manual checks) | Build effort without user value; can use AWS console + CloudWatch for v1 ops needs | AWS console for DynamoDB/SES metrics; CloudWatch for Lambda logs |
| **Specific date targeting** ("notify me only if Jan 15 is free") | Enormous complexity: UX, data model, filtering logic. Most users just want any slot. | 14-day window notification covers core need |
| **SMS notifications** | SES is already chosen; adding SNS SMS doubles complexity, cost, and regulatory surface area | Stick to email |
| **Weekly digest emails** | Users need fast notification to beat others to slots — a weekly digest misses the point entirely | Real-time (per-check-run) notifications |
| **Notification frequency preferences** ("max 1 per day") | Complexity vs value: most users will unsubscribe rather than configure. The check runs every ~15 min, slots don't open that often. | If notification volume becomes a problem, address in v2 with quiet-hours |
| **CAPTCHA on subscribe form** | Friction vs risk: bot abuse on a niche Dutch trailer rental form is low-probability; rate limiting + double opt-in already stop most abuse | API Gateway rate limiting + double opt-in is sufficient |
| **Social login** | Zero requirement, high complexity | N/A |

---

## Feature Dependencies

```
Subscribe form
  └─→ Subscribe API (Lambda) — validate + create PENDING record
        └─→ Confirmation email (SES) — sends double opt-in link
              └─→ Confirm endpoint (Lambda) — validates token, marks CONFIRMED
                    └─→ Subscriber is now active

Scheduled checker (Lambda) — runs every 15 min
  └─→ Per-township availability fetch (ACV API)
        └─→ Diff against DynamoDB cache
              └─→ If new slots found → query CONFIRMED subscribers for this township
                    └─→ SES send notifications (with ListManagementOptions or custom unsubscribe token)

Unsubscribe link (in every email)
  └─→ Unsubscribe endpoint (Lambda) — validates token, deletes/flags record
        └─→ SES account-level suppression list (auto-managed for bounces/complaints)
```

---

## MVP Recommendation

### Must ship (in order of dependency):

1. **Subscribe form + API** — with email validation, duplicate guard, role-address rejection
2. **Double opt-in confirmation** — SES confirmation email + confirm Lambda endpoint + 24h token TTL
3. **Scheduled availability checker** — existing logic, adapted to per-township DynamoDB cache
4. **Notification email** — with slot details and unsubscribe link
5. **Unsubscribe endpoint** — instant removal, confirmation page
6. **SES authentication** — SPF, Easy DKIM, DMARC (CDK setup, one-time)
7. **Rate limiting** — API Gateway throttle on subscribe endpoint

### Defer to v2:

- Multi-township subscription (model already supports it, UI is extra work)
- Subscription expiry / re-confirmation flow
- Email open/click tracking
- Quiet hours / digest batching

---

## Compliance Notes

> **This service operates in the Netherlands → GDPR applies (stricter than CAN-SPAM)**

| Requirement | Implication | Implementation |
|-------------|-------------|----------------|
| **Explicit consent (GDPR Art. 6)** | Double opt-in is the gold standard for documented, explicit consent | Confirmation email + timestamp stored in DynamoDB |
| **Purpose limitation** | Only use email for the stated purpose (slot notifications) | No marketing, no third-party sharing |
| **Data minimization** | Store only what's needed | email + township + confirmed status + created_at + confirmed_at — nothing else |
| **Right to erasure (GDPR Art. 17)** | Unsubscribe must delete or fully anonymize the record | Delete DynamoDB record on unsubscribe (or mark `DELETED` and stop sending) |
| **Unsubscribe must be honored immediately** | No batching unsubscribes | Lambda processes unsubscribe synchronously |
| **No pre-checked boxes** | User must actively submit the form | Angular form has no pre-filled consent state |
| **Privacy policy** | Required if collecting personal data (email = personal data under GDPR) | Link to privacy policy on subscribe form and in emails (even if policy is a simple page) |
| **Bulk sender (Gmail/Yahoo 2024 requirements)** | >5K emails/day senders must have one-click unsubscribe + low complaint rate | SES `List-Unsubscribe-Post` header (RFC 8058) satisfies one-click requirement; keep complaint rate <0.08% |

---

## Sources

- AWS SES Best Practices (official): https://docs.aws.amazon.com/ses/latest/dg/best-practices.html — HIGH confidence
- AWS SES Tips & Best Practices (sender reputation): https://docs.aws.amazon.com/ses/latest/dg/tips-and-best-practices.html — HIGH confidence
- AWS SES Subscription Management: https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html — HIGH confidence
- AWS SES Lists and Subscriptions: https://docs.aws.amazon.com/ses/latest/dg/lists-and-subscriptions.html — HIGH confidence
- AWS SES Account-Level Suppression List: https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html — HIGH confidence
- AWS SES Custom Verification Email: https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html — HIGH confidence
- RFC 2369 (List-Unsubscribe header): https://www.rfc-editor.org/rfc/rfc2369 — HIGH confidence
- RFC 8058 (List-Unsubscribe-Post / one-click): https://www.rfc-editor.org/rfc/rfc8058 — HIGH confidence
- GDPR Article 6 (lawful basis) + Article 17 (right to erasure): https://gdpr.eu/ — HIGH confidence
- Google/Yahoo Bulk Sender Requirements (2024): https://support.google.com/mail/answer/81126 — MEDIUM confidence (checked via SES docs reference)
