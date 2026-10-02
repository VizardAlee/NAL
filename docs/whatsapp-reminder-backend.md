# WhatsApp repayment reminders: backend groundwork

## Current boundary

The application calculates, previews and queues private repayment progress notices. No WhatsApp API requests are made by this release. Preparation is disabled by default. There is deliberately no public "send" endpoint and no fabricated consent or credentials. Existing in-app notifications remain operational.

The existing `runDailyAutomation` Cloud Scheduler invokes `/api/cron` at **16:00 Africa/Lagos**. It now also prepares WhatsApp notices when `reminderSettings/whatsapp.enabled` is true. Daily facilities: due-day and arrears progress notices at 16:00. Weekly/fortnightly facilities: one day before an unpaid scheduled installment. Monthly facilities: three calendar days before an unpaid scheduled installment. One consolidated notice per consenting client per Lagos date; scheduler retries cannot duplicate it. Completed/terminated facilities are excluded. Bank account information comes from `platformSettings/bankDetails`, not the customer's payment account.

Only Approved repayments count, including imported opening repayment allocations and overpayments applied to future installments. Raw uploaded receipts and Pending/Rejected repayments never count. Schedule overrides and approved frequency changes are honored through the existing amortization generator. Inconsistent allocations block preparation rather than inventing a balance.

The example's "2 days in default" is expressed as **daily repayment equivalents behind**. The oldest overdue scheduled payment's age is reported separately. Thirty-day blocks are reporting blocks for daily facilities, anchored to the actual first due date; they do not change contract duration or monthly due dates. Dates and amounts are generated, never copied from example messages. The full preview is currently English; `preferredLanguage` is retained for later approved language-specific Meta templates. Do not silently send English to a client requesting another language.

## Administrator API

All calls require a current full-administrator Firebase ID token in `Authorization: Bearer <token>`. Owners/staff/clients cannot use these operations. Do not paste tokens into logs, chat, or committed scripts.

`GET /api/whatsapp-reminders`: preparation enabled state, health counts and latest 25 outbox statuses. It explicitly reports `sendingConnected: false`.

`POST /api/whatsapp-reminders` accepts these JSON bodies:

```json
{"operation":"preview","clientId":"existing-client-id"}
```

Preview is read-only and shows each active deal plus a consolidated total. Never takes client-supplied balances or dates.

```json
{"operation":"consent","clientId":"existing-client-id","optedIn":true,"phone":"08032065880","evidence":"Client explicitly consented on DATE; consent form reference XYZ"}
```

Only record real, explicit consent. Keep its evidence reference. The WhatsApp number may be provided separately from the profile phone, but a later profile-phone change invalidates this consent until recorded again. Numbers are normalized to Nigerian international digits. Setting `optedIn: false` with an evidence/reason string withdraws consent and blocks queued delivery. Consent is never inferred merely because a customer gave a phone number.

```json
{"operation":"configure","enabled":true,"reason":"Enable private preparation for consenting clients; no WhatsApp sending yet"}
```

This enables **preparation only**, not sending. Use false to stop preparation/claims. Keep preparation off until consent and receiving bank details are checked.

```json
{"operation":"prepare"}
```

Runs the same idempotent preparation step as the scheduler. This creates outbox records only and never touches financial balances.

## Provider hand-off contract

The future authenticated server provider worker consumes `whatsappReminderOutbox`:

1. Configure Meta credentials in Secret Manager, the business phone-number ID, supported Graph API version and approved template names/languages. Do not use client-exposed environment variables or the archived WhatsApp Node SDK.
2. Map `deals`, totals and current reporting period into approved templates. A large multi-deal notice may need a shorter consolidated template with a secure authenticated statement link, or multiple approved templates; do not insert the entire multiline preview as an unconstrained template variable.
3. Call `claimWhatsAppReminder(db, outboxId, transportReady, now)` only when that provider/template/language is fully configured. False is a no-op. Claims refresh the approved financial position, recheck opt-in/phone, cancel stale/expired notices and atomically transition PREPARED to SENDING. Only one worker can acquire the claim.
4. Call Meta outside Firestore transactions. Call `recordWhatsAppSendResult` with the claim's attemptId and SENT plus Meta message ID only on an explicit provider acknowledgement. Definitive rejection is FAILED; network timeout/ambiguous outcome is UNKNOWN. Never automatically resend UNKNOWN or a crashed SENDING attempt; investigate provider status first. SENT means API acceptance, not delivery/read confirmation.
5. Implement the Meta verification handshake and app-secret HMAC-verified webhooks for delivery/read/failed statuses and client opt-outs. Reject forged callbacks. These provider endpoints and the network sender are intentionally not connected in this groundwork.
6. Test using an explicitly opted-in test number, compare every amount with the application, confirm language/template approval and then enable the provider worker. Never replay old prepared queues: notices expire at the next Lagos midnight.

Acknowledged sends maintain a baseline for the next notice's **net change in approved repayments**. A changed active-deal set suppresses that comparison, preventing a completed deal from looking like a repayment reversal. Failed/prepared/unknown notices never advance the baseline. No automatic proportional redistribution of money occurs: notices describe the ledger's existing allocations.

## Security / operations

Consent, consent audit, outbox, delivery state, health and preparation error records are server-only Firestore collections. Queue payloads contain personal financial information: do not export them to a public bucket or put them in application logs. Error records contain a restricted client reference and a generic review code; the authorized preview operation provides validation diagnostics. Privacy notices and retention periods must be updated before real external messaging begins.

Deployment requires the web backend and Firestore rules. The existing scheduler need not be changed. Deploying this code does not activate preparation or delivery. No transport credentials are required for disabled preparation or read-only previews.

Meta references: [official Cloud API examples](https://github.com/fbsamples/whatsapp-api-examples), [approved template parameter format](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/) (reference only; that SDK is archived).
