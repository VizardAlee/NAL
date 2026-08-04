# Web Operations Runbook

## Release gate

Run `npm run verify`. Deploy only when typecheck, lint, unit tests, Firestore rules tests, and the production build all pass. Complete `docs/testing_checklist.md` against the staging Firebase project with each supported role.

## Deployment and rollback

The `main` branch is the production branch. GitHub Actions runs the complete verification suite before deploying Cloud Functions, Firestore rules and indexes, and Storage rules. Firebase App Hosting independently rolls out the verified repository commit when automatic rollouts are enabled for `main`.

The backend deployment uses keyless Google Workload Identity Federation. Configure these GitHub repository variables before setting `FIREBASE_CI_ENABLED` to `true`:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: full Workload Identity provider resource name.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: deployment service-account email.
- `FIREBASE_CI_ENABLED`: set to `true` only after the identity and required IAM roles have been verified.

In Firebase App Hosting, connect `VizardAlee/NAL`, set the app root to `/`, set the live branch to `main`, enable automatic rollouts, and leave Required Paths blank so every commit triggers a rollout.

Deploy Firebase rules before application code when a release depends on stricter authorization. Record the App Hosting release ID and Git commit. Roll back through Firebase App Hosting to the prior healthy release; restore the matching prior Firestore rules when required.

Before the first production deployment, create one shared secret with `firebase functions:secrets:set CRON_SECRET`, grant the App Hosting backend access to it, and deploy Functions, Firestore rules, indexes, and Storage rules. The `runDailyAutomation` scheduled function runs at 00:05 Africa/Lagos time and retries failed invocations three times.

## Monitoring

Configure App Hosting error and latency alerts, Cloud Logging alerts for failed approval/cron operations, and budget alerts for Firebase and AI usage. Verify `/api/cron` returns 401 without its bearer secret and monitor every scheduled invocation.

Alert on any `runDailyAutomation` error, any approval action error, a five-minute HTTP 5xx rate above 1%, and p95 latency above two seconds. Route alerts to at least two administrators.

The Admin dashboard is the operational source of truth for daily automation. It displays the latest start, completion, status, error and job totals from `automationHealth/daily`. If the scheduled run is missing or failed, a full administrator must use **Run now**, confirm a successful result, and investigate the failed `automationRuns` record and Cloud Logging entry. Never interpret an empty recovery queue as proof that automation ran.

## Recovery operations

The daily job creates one deterministic case per deal instalment from three days before due date onward. Only approved repayments reduce the case balance. Partial payments leave the exact remainder open; full payment resolves the case automatically. The job catches missed prior runs, expires promises to pay, escalates balances overdue by seven calendar days to Legal, and closes open cases for deals that are no longer active.

Recovery officers must claim an unassigned case before working it, record every contact using a structured channel and outcome, set the next action, and attach supporting evidence where relevant. Administrators may assign, reassign, or return cases to the unassigned queue. Recovery staff can read only unassigned Recovery cases and cases assigned to them; they cannot issue notices or read Legal case files.

## Legal case operations

Legal officers receive the complete escalated case, including the financial snapshot, guarantor details, recovery timeline and evidence. They must claim or be assigned the case, record each material action and deadline, and attach service, court, settlement, or other evidence. Signed agreement downloads are served through the backend and accepted only after the archived PDF passes its SHA-256 integrity check.

Demand notices follow a two-step control: **prepare draft**, then **review and issue**. Printing does not issue a notice. The issuance action changes the case stage, timestamps the reviewer and issue, creates an immutable audit entry, and notifies the client and administrators. The supplied notice text is an operational draft; authorised Nigerian counsel must approve the template and service procedure before the first production use and after any applicable legal change.

Settlement or administrative closure must include a written reason. “Fully paid” closure is blocked unless the recorded outstanding balance is zero. Evidence files are private Storage objects limited to the assigned operational stage and full administrators.

## Backup and restore

Enable scheduled Firestore exports to a versioned, access-restricted Cloud Storage bucket. Perform and document a restore rehearsal before launch and at least quarterly. Never test restores against production.

Include `recoveryTasks` and its `logs`, `evidence`, `notices`, and `expenses` subcollections, plus `automationRuns` and `automationHealth`, in retention and legal-hold procedures. Record export job success and restore rehearsal evidence outside the production project.

## Residual-risk register

- External counsel owns final approval of demand wording, limitation periods, service methods, court filings, settlement authority, evidence retention, and privacy notices.
- An administrator must review the automation health card every business day; Cloud alert delivery must be tested quarterly with two recipients.
- Firestore export and restoration remain cloud-configuration controls and are not completed by application deployment alone. Test restoration before launch and quarterly.
- Imported legacy repayments and deals must be reconciled before automation is enabled; only approved repayments are credited.
- Access to Recovery and Legal personas must be reviewed monthly and immediately after staff role changes.
- Client and guarantor contact details remain operational data; officers must verify them before notice service or enforcement.
- The August 2026 dependency audit has no critical finding. Non-breaking fixes for `brace-expansion` and `fast-uri` are applied; remaining Next.js/Sharp and Genkit/OpenTelemetry advisories require breaking framework migrations. Track them as a dedicated upgrade, retest proposal analysis and image/PDF paths, and do not use `npm audit fix --force` on production branches.

## Financial incident response

Disable approval access, preserve logs, and identify records by `sourceRequestId`. Do not repair balances manually without a reviewed reconciliation. Restore service only after request, transaction, fund-batch, investment, and platform-earning totals agree.
