# Web Operations Runbook

## Release gate

Run `npm run verify`. Deploy only when typecheck, lint, unit tests, Firestore rules tests, and the production build all pass. Complete `docs/testing_checklist.md` against the staging Firebase project with each supported role.

## Deployment and rollback

The `main` branch is the production branch. GitHub Actions runs the verification suite before deploying Cloud Functions, Firestore rules and indexes, Storage rules, and then App Hosting. Independent automatic App Hosting rollouts must not bypass this gate.

The backend deployment uses keyless Google Workload Identity Federation. Configure these GitHub repository variables before setting `FIREBASE_CI_ENABLED` to `true`:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: full Workload Identity provider resource name.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: deployment service-account email.
- `FIREBASE_CI_ENABLED`: set to `true` only after the identity and required IAM roles have been verified.

In Firebase App Hosting, connect `VizardAlee/NAL`, set the app root to `/`, and use the verified deployment workflow for production rollouts.

Deploy Firebase rules before application code when a release depends on stricter authorization. Record the App Hosting release ID and Git commit. Roll back through Firebase App Hosting to the prior healthy release; restore the matching prior Firestore rules when required.

Before the first production deployment, create one shared secret with `firebase functions:secrets:set CRON_SECRET`, grant the App Hosting backend access to it, and deploy Functions, Firestore rules, indexes, and Storage rules. The `runDailyAutomation` scheduled function runs at 16:00 Africa/Lagos time and retries failed invocations three times.

## Monitoring

Configure App Hosting error and latency alerts, Cloud Logging alerts for failed approval/cron operations, and budget alerts for Firebase and AI usage. Verify `/api/cron` returns 401 without its bearer secret and monitor every scheduled invocation.

Alert on any `runDailyAutomation` error, any approval action error, a five-minute HTTP 5xx rate above 1%, and p95 latency above two seconds. Route alerts to at least two administrators.

The Admin dashboard is the operational source of truth for daily automation. It displays the latest start, completion, status, error and job totals from `automationHealth/daily`. If the scheduled run is missing or failed, investigate the `automationRuns` record and Cloud Logging entry and identify which components already completed. Reconcile any financial work before an explicitly authorized **Run now** attempt; repeated alerts or a successful recovery component do not establish overall success. Never interpret an empty recovery queue as proof that automation ran.

### Referral-code pause

Referral-code entry, generation and sharing are paused. Marketer roles and manual deal attribution remain available. Existing `referralCode` and `referredByCode` values are retained for historical reporting and ratings; do not delete or backfill them. No-code marketer ratings are reported as skipped, with stored ratings unchanged. Referral metrics display as unavailable rather than zero; directly attributed deals remain reportable. A skipped rating does not bypass failures in other daily components, including missing owner-profit configuration. Do not run production financial processing merely to verify this UI change.

## Owner allocation and annual withdrawals

Owner allocation transfers the distributable amount from available platform fund batches to owner fund batches in one transaction. Percentages, share units and kobo rounding follow the configured policy. The allocation records its `platformCashDeductions`; retries do not debit or credit again. Insufficient available platform cash leaves the allocation pending with no partial posting. Investigate the source earning, committed cash and allocation record before any retry. This release does not repair historical allocations or reconcile already deployed cash; those require a separately reviewed reconciliation and explicit authorization. Do not rerun historical processing to test the fix.

Investments longer than two years retain their five-day annual window and 20% limit on the preceding investment year's realised profit. That annual allowance is an exception to the ordinary maturity lock. Requests and approvals must fit the recorded active window, remaining allowance, unconsumed profit, pending reservations and available cash. An expired or mismatched window cannot be approved; do not alter dates or limits to bypass the check. Principal locks remain unchanged.

Role changes read the actor, target and current owners in one transaction. Concurrent owner demotions cannot remove the last owner; persona assignments are preserved.

Approved repayment-frequency changes preserve paid installments, total principal and profit, and the exact original final due date. The final interval absorbs any remainder when the new frequency does not divide the remaining term evenly. Existing financial records are not rewritten by deployment.

### Financial review safeguards

Investor profit is a separate cash sub-ledger: realised `ProfitDistribution` credits, less profit withdrawals and reinvestment debits. Profit withdrawals never deduct principal fund batches. Reinvestment debits that profit ledger and creates an equal principal deposit and fund batch in the same transaction. Capital withdrawals continue to consume only eligible principal batches; owner withdrawals continue to consume owner allocation batches. Existing incorrect deductions are not repaired by this release and require separately authorised reconciliation.

Profit request submission and approval share current maturity, ownership/persona and reservation checks. Profit with a missing, unlinked or foreign source batch is not treated as matured; its eligibility requires separate evidence review without automatic record repair. Both pending withdrawal and reinvestment requests reserve the same profit pool. Annual withdrawals remain capped by the recorded active allowance. Invalid, non-finite, negative or fractional-kobo amounts are refused; an invalid pending reservation blocks further profit processing until an administrator rejects it. Reinvestment creation and updates, and all message creation, are server-only under the deployed root `firestore.rules`.

A frequency change preserves every installment referenced by approved allocation rows, including partial payments and multi-installment prepayments. Repayment approval also checks the overall outstanding contract principal and profit, independently of installment IDs. Inconsistent allocation records and ambiguous legacy prepayments require review before restructuring; the application does not invent or rewrite historical allocations. A refused approval performs no financial posting.

The legacy `/admin/terminations` URL temporarily redirects (HTTP 307) to `/admin/approvals/terminations`, preserving query parameters and the canonical portal authorization checks.

## Recovery operations

The daily job creates one deterministic case per deal instalment from three days before due date onward. Only approved repayments reduce the case balance. Partial payments leave the exact remainder open; full payment resolves the case automatically. The job catches missed prior runs, expires promises to pay, escalates balances overdue by seven calendar days to Legal, and closes open cases for deals that are no longer active.

Recovery officers must claim an unassigned case before working it, record every contact using a structured channel and outcome, set the next action, and attach supporting evidence where relevant. Administrators may assign, reassign, or return cases to the unassigned queue. Recovery staff can read only unassigned Recovery cases and cases assigned to them; they cannot issue notices or read Legal case files.

## Legal case operations

Legal officers receive the complete escalated case, including the financial snapshot, guarantor details, recovery timeline and evidence. They must claim or be assigned the case, record each material action and deadline, and attach service, court, settlement, or other evidence. Signed agreement downloads are served through the backend and accepted only after the archived PDF passes its SHA-256 integrity check.

Demand notices follow a two-step control: **prepare draft**, then **review and issue**. Printing does not issue a notice. The issuance action changes the case stage, timestamps the reviewer and issue, creates an immutable audit entry, and notifies the client and administrators. The supplied notice text is an operational draft; authorised Nigerian counsel must approve the template and service procedure before the first production use and after any applicable legal change.

Settlement or administrative closure must include a written reason. “Fully paid” closure is blocked unless the recorded outstanding balance is zero. Evidence files are private Storage objects limited to the assigned operational stage and full administrators.

## Backup and restore

On 9 October 2026, production database `(default)` in `studio-1298078893-e7941` was verified with daily native backups retained for 14 days, point-in-time recovery enabled, and database deletion protection enabled. Schedule: `3cf4b520-b7c8-4e04-ad38-5b33bbcdb79e`. These safeguards incur Cloud charges. The seven-day PITR history accumulates over time; enabling it does not immediately provide seven days of history. Check the database's `earliestVersionTime` before choosing a recovery point. A configured schedule is not proof that its first backup has completed.

Before launch, verify that a backup has completed and perform a documented restore rehearsal in an isolated non-production destination using Google's supported restore/export workflow. Never overwrite production to test a restore. Compare document counts and financial invariants, test access controls, and record recovery time and recovery point. Repeat at least quarterly. No restore rehearsal has yet been certified.

Firestore backups do not cover Firebase Auth accounts or Storage document/image objects. Define and test separate recovery and retention procedures for both before declaring whole-application recovery complete.

Two enabled log-based failure alert policies were created on 9 October 2026: application/automation failures (`7913937012548037177`) and Firestore backup/restore failures (`7328744595726045751`). Email channel: `3782488741670412064`. Delivery must be confirmed by the recipient; configuration alone does not prove delivery. Add a second operational recipient, and separately configure missing-backup, availability, latency and budget alerts.

Include `recoveryTasks` and its `logs`, `evidence`, `notices`, and `expenses` subcollections, plus `automationRuns` and `automationHealth`, in retention and legal-hold procedures. Record export job success and restore rehearsal evidence outside the production project.

## Residual-risk register

### Mixed historical agreement bundles

Upload an investor Mudaraba and its documented client Murabaha, Wakalah and Kafaalah evidence in the same historical case (maximum 12 files). Extraction proposes related customers and document relationships; it never approves them. In **People and accounts**, select an existing client/investor or explicitly choose a new unclaimed profile, verify organisation representatives, and confirm each identity. Use those reviewed import accounts in each deal/fund allocation. Matching names are suggestions, not proof that two people are the same. Guarantors and witnesses are not automatically registered as financial customers.

In **Document relationships**, classify every uploaded file, link investor agreements to their fund contract and sales/agency/guarantee evidence to the correct deal, then verify the source reference, parties, assets and dates. Multiple agreement entries may refer to one PDF. Ongoing deals require verified Kafaalah evidence; Wakalah is optional and grants procurement authority only on its selected Murabaha deal. Imported documents remain original historical evidence and never acquire invented electronic signatures or extra payment credits. Existing customer records and KYC are not overwritten. New accounts are disabled/unclaimed until the existing invitation process is completed; missing KYC still needs collection.

Save and reconcile, resolve all red issues, then approve and post. Profiles and financial documents are committed atomically in Firestore; normalized-name duplicate checks run inside that transaction. Disabled deterministic Auth shells may survive a failed posting (no access or financial balances); retry the same review after resolving its error rather than creating another customer. Customer-visible originals are restricted to the linked customer; combined files with different customers and OTHER supporting evidence remain admin-only. Split mixed-customer PDFs before sharing. Corrections hide superseded source reviews from customer document lists; already issued signed URLs can remain valid for their short expiry period.

Acceptance coverage uses synthetic loopback emulators only: a mixed Mudaraba/Murabaha/Wakalah/Kafaalah bundle creates one disabled unclaimed organisation client, preserves its representative, assigns agency and guarantor evidence, and does not invent repayments. It does not certify Gemini extraction accuracy on real scans. Administrators must review every actual extraction and reconcile financial totals against bank evidence.

- External counsel owns final approval of demand wording, limitation periods, service methods, court filings, settlement authority, evidence retention, and privacy notices.
- An administrator must review the automation health card every business day; Cloud alert delivery must be tested quarterly with two recipients.
- Daily Firestore backups, PITR and deletion protection are configured, but completed-backup verification, restoration rehearsal, Auth/Storage recovery and alert delivery remain separate launch controls.
- Imported legacy repayments and deals must be reconciled before automation is enabled; only approved repayments are credited.
- Access to Recovery and Legal personas must be reviewed monthly and immediately after staff role changes.
- Client and guarantor contact details remain operational data; officers must verify them before notice service or enforcement.
- The 9 October 2026 non-breaking dependency refresh removed the critical advisories. The production dependency audits still report 16 high and 53 moderate web advisories and seven moderate Functions advisories. Re-run audits for each release, assess exploitability and upgrade paths, and do not use `npm audit fix --force` on production branches.
- Guarantor-photo path reads are restricted to their owner and full administrators. Previously issued bearer download URLs are not revoked by a Storage rule change; assess token rotation or authenticated delivery without breaking archived agreement evidence.

## Financial incident response

Disable approval access, preserve logs, and identify records by `sourceRequestId`. Do not repair balances manually without a reviewed reconciliation. Restore service only after request, transaction, fund-batch, investment, and platform-earning totals agree.


## Pending role synchronization and automation reporting

Role changes save the profile, a deterministic `AccessRoleChange` audit event and a server-only `roleChangeOperations/{uid}` intent atomically. A definitive non-mutating Auth rejection, or a reporting failure after confirmed Auth completion, leaves `PENDING`; an authorized administrator can use **Retry access synchronization** on the current role. Another role change is refused until synchronization finishes. Unrelated claims and personas are retained; existing tokens refresh normally. Same-role repair cannot reconstruct missing historical audit facts and does not invent an earlier role-change event.

An interrupted or ambiguous Auth write stays `WORKING` (`claimsOutcome: UNCERTAIN` when recorded) and has no timed lock takeover. A rejected network promise does not prove the remote write has stopped. Confirm the original writer has stopped and review the current profile, intent and Auth outcome before proposing a separately authorized recovery. Do not clear locks merely because they are old. Auth has no transaction or compare-and-swap with Firestore; independent signup/claims writers remain outside this administrator recovery path and require separate review if they conflict. No token revocation or automated historical repair is introduced.

Each daily component records its own outcome. Successful initial components remain visible if a sibling or owner allocation fails; later stages still do not run past a failure gate. Health belongs to the latest started run, with older run results retained separately. A running record older than 15 minutes is displayed as overdue with unknown outcome. Successful health becomes stale after the next existing 15:00 UTC schedule plus a 30-minute reporting allowance; this display does not stop, retry or certify any job. Reporting failures never rerun business work. Check component outcomes before any separately approved retry. Missing owner policy remains a failure; this change supplies no policy or partner configuration.

Reconciliation uses bounded live cursor traversal. Continue empty filtered pages when a continuation exists. Candidate and statement-coverage searches are independent of visible list pages and remain incomplete until traversal finishes. Refresh after other administrators edit documents; pagination is not a cross-request snapshot. Discovery never posts money; the existing transaction still validates a selected bank entry.
