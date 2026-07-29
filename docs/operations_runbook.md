# Web Operations Runbook

## Release gate

Run `npm run verify`. Deploy only when typecheck, lint, unit tests, Firestore rules tests, and the production build all pass. Complete `docs/testing_checklist.md` against the staging Firebase project with each supported role.

## Deployment and rollback

Deploy Firebase rules before application code when a release depends on stricter authorization. Record the App Hosting release ID and Git commit. Roll back through Firebase App Hosting to the prior healthy release; restore the matching prior Firestore rules when required.

## Monitoring

Configure App Hosting error and latency alerts, Cloud Logging alerts for failed approval/cron operations, and budget alerts for Firebase and AI usage. Verify `/api/cron` returns 401 without its bearer secret and monitor every scheduled invocation.

## Backup and restore

Enable scheduled Firestore exports to a versioned, access-restricted Cloud Storage bucket. Perform and document a restore rehearsal before launch and at least quarterly. Never test restores against production.

## Financial incident response

Disable approval access, preserve logs, and identify records by `sourceRequestId`. Do not repair balances manually without a reviewed reconciliation. Restore service only after request, transaction, fund-batch, investment, and platform-earning totals agree.
