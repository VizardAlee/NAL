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

## Backup and restore

Enable scheduled Firestore exports to a versioned, access-restricted Cloud Storage bucket. Perform and document a restore rehearsal before launch and at least quarterly. Never test restores against production.

## Financial incident response

Disable approval access, preserve logs, and identify records by `sourceRequestId`. Do not repair balances manually without a reviewed reconciliation. Restore service only after request, transaction, fund-batch, investment, and platform-earning totals agree.
