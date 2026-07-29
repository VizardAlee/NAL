# NAL App Testing Checklist

Use this checklist before releases, after large feature changes, and whenever Firebase rules, auth, payments, deals, or role access changes. Mark each item as `Pass`, `Fail`, `Blocked`, or `N/A`, and record the test account, browser/device, and notes for every failure.

## Automated release gate

Run `npm run verify` before starting manual staging checks. The command must pass typechecking, linting, finance unit tests, Firestore emulator security/concurrency tests, and the production build. CI runs the same gate on every pull request and push to `main`. Do not deploy by bypassing a failed gate.

- [ ] Record the successful CI run and Git commit for this release.
- [ ] Confirm the Firestore rules tests include privilege escalation, ledger writes, messaging spoofing, and concurrent approval coverage.
- [ ] Confirm the production build performs type and lint validation rather than skipping them.
- [ ] Complete the backup/restore, monitoring, and rollback preparation in `docs/operations_runbook.md`.

## 1. Test Setup

- [ ] Confirm `.env` / Firebase config values point to the intended test or staging project.
- [ ] Confirm the app starts with `npm run dev` and loads at `http://localhost:9002`.
- [ ] Run `npm run typecheck` and resolve TypeScript errors.
- [ ] Run `npm run build` and confirm production build succeeds.
- [ ] Confirm Firebase emulators or staging services are available for auth, Firestore, functions, storage, and messaging where applicable.
- [ ] Prepare test users for each role: Admin, Investor, Client, Legal, Recovery, Marketer, Owner, and a user with no assigned role.
- [ ] Prepare test data: pending deal request, active deal, completed deal, terminated deal, deposit request, withdrawal request, repayment request, termination request, reinvestment request, chat request, notifications, messages, and financing modes.
- [ ] Test in at least Chrome desktop, Safari or Firefox desktop, and one mobile viewport.
- [ ] Test both light and dark theme if both are supported.

## 2. Public Pages

- [ ] Landing page loads without console errors.
- [ ] Navigation links route to the correct pages.
- [ ] Login page loads, validates required fields, and rejects invalid credentials.
- [ ] Signup page validates required fields, email format, password strength, and duplicate email handling.
- [ ] Signup role selection saves the selected role or sends the user to the correct next step.
- [ ] Forgot password sends a reset email for valid accounts and shows a safe response for unknown accounts.
- [ ] Terms page loads.
- [ ] Privacy page loads.
- [ ] Offline page displays correctly when the app is offline or manually visited.
- [ ] Public pages are usable on mobile widths without clipped text or overlapping UI.

## 3. Authentication And Sessions

- [ ] Users can sign in and are redirected to the correct role dashboard.
- [ ] Users can sign out and cannot return to protected pages with the browser back button.
- [ ] Expired sessions show a clear state and recover after signing in again.
- [ ] Users with no role are not allowed into role dashboards.
- [ ] Role changes in Firestore or custom claims are reflected after token refresh or re-login.
- [ ] Password change works from settings and rejects weak or incorrect current passwords.
- [ ] Profile update works and persists after refresh.
- [ ] Unauthorized direct URL visits redirect or show access denied.
- [ ] Loading states appear while auth and user documents are resolving.

## 4. Role-Based Access

- [ ] Admin can access only admin pages and shared pages intended for admins.
- [ ] Investor can access investor dashboard, transactions, analyzer, financing modes, messages, notifications, and settings.
- [ ] Client can access client dashboard, deals, deal request, analyzer, financing modes, messages, notifications, and settings.
- [ ] Legal can access legal dashboard and notifications.
- [ ] Recovery can access recovery dashboard and notifications.
- [ ] Marketer can access marketer dashboard and notifications.
- [ ] Owner can access owner dashboard and notifications.
- [ ] Every role is blocked from another role's dashboard by direct URL.
- [ ] Sidebar/nav only shows actions available to the signed-in role.
- [ ] Admin shortcut, role switcher, and admin navigation do not expose unauthorized actions to non-admin users.

## 5. Admin Dashboard

- [ ] Dashboard metrics load with correct totals for users, funds, deals, requests, repayments, and activity.
- [ ] Empty states render correctly when there is no data.
- [ ] Loading skeletons appear while data is loading.
- [ ] Error states display useful messages when Firestore reads fail.
- [ ] Date, currency, percentage, and status formatting are correct.
- [ ] Dashboard remains readable on tablet and mobile widths.

## 6. Admin Users

- [ ] User list loads and supports available filters/search/sorting.
- [ ] Admin can create Investor, Client, Marketer, Admin, Legal, and Recovery users.
- [ ] Duplicate email, invalid email, short password, and missing required fields are rejected.
- [ ] Marketer creation generates and stores a referral code.
- [ ] Referral code input stores `referredByCode` for referred users.
- [ ] User detail page loads correct user information.
- [ ] Admin can update role/profile fields where supported.
- [ ] Admin cannot accidentally corrupt auth claims or Firestore user role.
- [ ] User activity or related records display accurately.

## 7. Admin Deals

- [ ] Deal list loads pending, active, completed, and terminated deals.
- [ ] Deal filters and status badges match Firestore data.
- [ ] Admin can create a deal with valid values.
- [ ] Deal creation rejects missing client, non-positive principal, invalid rate, invalid duration, and invalid repayment options.
- [ ] Management fee amount is calculated correctly.
- [ ] Start date is saved correctly and used for schedule calculations.
- [ ] Deal detail page shows client, principal, profit rate, management fee, duration, repayment type, frequency, status, and funding state.
- [ ] Repayment schedule is generated correctly for equal installments.
- [ ] Repayment schedule is generated correctly for balloon payment.
- [ ] Daily, weekly, fortnightly, and monthly repayment frequencies produce expected due dates.
- [ ] Day, week, fortnight, month, and year duration units produce expected total periods.
- [ ] Admin can update supported deal fields without breaking schedule/history.
- [ ] Completed and terminated deals cannot be modified in unsupported ways.

## 8. Deal Funding And Funds

- [ ] Admin funds page displays platform and investor fund batches.
- [ ] Admin can add valid fund batches.
- [ ] Invalid fund amount, tenure value, and tenure unit are rejected.
- [ ] Funding a deal succeeds when enough eligible funds exist.
- [ ] Funding a deal fails safely when funds are insufficient.
- [ ] Funding uses the expected allocation order and updates `remainingAmount`.
- [ ] Partial funding, exact funding, and overfunding scenarios behave correctly.
- [ ] Duplicate clicks or refresh during funding do not double-fund the deal.
- [ ] Funded deal status changes as expected.
- [ ] Investments are created with correct investor/source, amount, dates, and deal reference.

## 9. Admin Approval Queues

- [ ] Deal request approval queue loads pending requests.
- [ ] Approving a deal request creates or updates the correct deal record.
- [ ] Rejecting a deal request stores status and reason where supported.
- [ ] Deposit approval queue loads pending deposits.
- [ ] Approving deposit creates or updates investor fund balance/batches correctly.
- [ ] Rejecting deposit does not change investor funds.
- [ ] Withdrawal approval queue loads pending withdrawals.
- [ ] Approving withdrawal deducts funds correctly and prevents negative balances.
- [ ] Reinvestment approval queue processes valid reinvestments correctly.
- [ ] Repayment approval queue applies repayments to the correct deal/installment.
- [ ] Termination approval queue terminates eligible deals and blocks invalid termination.
- [ ] Chat request approval queue enables or denies conversations correctly.
- [ ] Each approval action has clear success, error, and loading states.
- [ ] Repeated approval clicks do not process the same request twice.

## 10. Client Workflows

- [ ] Client dashboard shows only that client's data.
- [ ] Client deal list shows the client's deals and no other clients' deals.
- [ ] Client deal detail shows schedule, repayment status, fees, and history accurately.
- [ ] Client can submit a valid deal request.
- [ ] Deal request validates principal, rate, duration, repayment type, frequency, and proposal details.
- [ ] Proposal PDF upload accepts valid PDF/data URI and rejects unsupported files or oversized files.
- [ ] Submitted request appears in admin deal request approvals.
- [ ] Client can see deal request status updates after admin action.
- [ ] Client analyzer page accepts proposal text and shows an analysis result.
- [ ] Client financing modes page loads and explains available modes correctly.
- [ ] Client settings update works and persists.

## 11. Investor Workflows

- [ ] Investor dashboard shows available balance, invested amount, returns, and relevant totals.
- [ ] Investor can submit a deposit request.
- [ ] Deposit form rejects zero, negative, empty, and invalid amounts.
- [ ] Deposit request appears in admin deposit approvals.
- [ ] Approved deposit updates investor view correctly.
- [ ] Investor can submit a withdrawal request where supported.
- [ ] Withdrawal form blocks amounts above available balance.
- [ ] Withdrawal request appears in admin withdrawal approvals.
- [ ] Investor transactions page shows deposits, withdrawals, investments, repayments, and returns accurately.
- [ ] Investor analyzer page works with valid proposal text.
- [ ] Investor financing modes page loads.
- [ ] Investor settings update works and persists.

## 12. Legal Workflows

- [ ] Legal dashboard loads assigned or relevant legal items.
- [ ] Legal user can view required client/deal legal documents.
- [ ] Signed legal document fields display correctly when present.
- [ ] Missing legal documents produce clear empty states.
- [ ] Legal notifications page loads and marks notifications correctly where supported.
- [ ] Legal user cannot access admin-only mutation actions.

## 13. Recovery Workflows

- [ ] Recovery dashboard loads overdue, failed, or recovery-related repayments.
- [ ] Recovery actions update the correct recovery records.
- [ ] Recovery user can view required client/deal repayment details.
- [ ] Recovery user cannot access admin-only deal creation, funding, or user management.
- [ ] Recovery notifications page loads and handles empty/error states.

## 14. Marketer Workflows

- [ ] Marketer dashboard loads referred users/deals.
- [ ] Marketer sees their referral code.
- [ ] Referred users are associated with the correct marketer.
- [ ] Marketer rating displays and updates according to expected business logic.
- [ ] Marketer cannot view unrelated clients, investors, or admin pages.
- [ ] Marketer notifications page loads and handles empty/error states.

## 15. Owner Workflows

- [ ] Owner dashboard loads high-level business metrics.
- [ ] Owner can view intended reports or summaries.
- [ ] Owner cannot perform restricted admin-only mutations unless intended.
- [ ] Owner notifications page loads and handles empty/error states.

## 16. Messaging And Chat

- [ ] Messages list loads conversations for the signed-in user only.
- [ ] Admin messages list loads relevant admin conversations.
- [ ] Conversation detail page loads existing messages in correct order.
- [ ] Sending a message creates one Firestore message with correct sender, timestamp, body, and conversation ID.
- [ ] Empty messages are blocked.
- [ ] Long messages wrap correctly and do not break layout.
- [ ] Realtime updates show newly sent messages without refresh.
- [ ] Users cannot access conversations they do not belong to by direct URL.
- [ ] Chat approval flow enables conversations only after approval where required.
- [ ] Message notification or unread indicator updates correctly where supported.

## 17. Notifications And Push

- [ ] Notification bell shows unread count correctly.
- [ ] Notifications page loads all relevant notifications for each role.
- [ ] Opening or marking notifications updates read status.
- [ ] Notification links route to the correct destination.
- [ ] Firebase Messaging service worker registers successfully in supported browsers.
- [ ] FCM token is saved to the user's `fcmTokens` array.
- [ ] Permission denied, unsupported browser, and offline states are handled gracefully.
- [ ] Duplicate FCM tokens are not stored repeatedly.

## 18. AI Analyzer

- [ ] Analyzer loads for admin, client, and investor roles where available.
- [ ] Empty proposal text is rejected.
- [ ] Valid proposal text returns an analysis result.
- [ ] Very long proposal text is handled or rejected with a clear message.
- [ ] AI errors, timeouts, missing API key, and quota failures show user-friendly errors.
- [ ] Analyzer result does not expose hidden prompt or sensitive server config.
- [ ] Generated recommendation is displayed without layout overflow.

## 19. Financial Calculations

- [ ] Management fee equals principal multiplied by management fee rate.
- [ ] Profit amount and expected return match agreed formula.
- [ ] Equal installment principal/profit split matches expected totals.
- [ ] Balloon payment schedule matches expected final payment behavior.
- [ ] Repayment due dates handle month-end dates correctly.
- [ ] Leap year and February dates do not break schedules.
- [ ] Rounding is consistent across dashboard, detail pages, reports, and transactions.
- [ ] Total scheduled repayment equals expected principal plus profit.
- [ ] Partial repayments, late repayments, and overpayments behave according to business rules.
- [ ] Completed deal state is reached only after required repayments are satisfied.

## 20. Firestore Rules And Data Security

- [ ] Unauthenticated users cannot read protected collections.
- [ ] Unauthenticated users cannot write protected collections.
- [ ] Each role can read only intended user, deal, request, message, notification, and transaction documents.
- [ ] Each role can write only intended documents and fields.
- [ ] Client cannot read or write another client's deals or requests.
- [ ] Investor cannot read or write another investor's funds, transactions, or requests.
- [ ] Non-admin users cannot approve requests.
- [ ] Non-admin users cannot create admin-only records.
- [ ] Message participants cannot be spoofed by changing document IDs or payload fields.
- [ ] Server-only fields such as status, processedAt, createdAt, balances, and role are protected where required.
- [ ] Firestore indexes support the app's queries without runtime index errors.

## 21. Cloud Functions And Server Actions

- [ ] `createUser` callable creates Firebase Auth user, custom role claim, and Firestore user document.
- [ ] `createUser` handles duplicate email and validation errors.
- [ ] `createDeal` callable accepts only authenticated admin users.
- [ ] `createDeal` validates payload and creates the expected Firestore document.
- [ ] Server actions reject unauthenticated calls.
- [ ] Server actions reject users without the required role.
- [ ] API route `/api/fund-deal` validates auth, role, deal ID, and funding state.
- [ ] API route `/api/cron` is protected from unauthorized public use.
- [ ] Server-side Firebase Admin initialization does not run in client bundles.
- [ ] Server errors are logged without leaking secrets to users.

## 22. Reports, Activity, Tax, And Exports

- [ ] Admin reports page loads with correct date ranges and totals.
- [ ] Report filters produce expected results.
- [ ] CSV or export functionality works if available.
- [ ] Exported values match on-screen values.
- [ ] Admin activity page records key mutations such as approvals, funding, user changes, and repayments.
- [ ] Tax page calculations and filtering match expected business rules.
- [ ] Empty and error states are clear for all reporting pages.

## 23. UI, Accessibility, And Responsiveness

- [ ] All pages fit at 320px, 375px, 768px, 1024px, and desktop widths.
- [ ] No text overlaps, clips, or escapes buttons/cards/tables.
- [ ] Tables remain usable on mobile through wrapping, scrolling, or responsive layout.
- [ ] Forms can be completed with keyboard only.
- [ ] Focus states are visible.
- [ ] Dialogs trap focus and close correctly.
- [ ] Buttons and links have accessible names.
- [ ] Color contrast is readable in light and dark themes.
- [ ] Toasts and errors are noticeable but do not block unrelated actions.
- [ ] Loading, empty, success, and error states are consistent across pages.
- [ ] Browser console has no uncaught errors during normal flows.

## 24. Offline, Network, And Reliability

- [ ] App shows a sensible state when network is disconnected.
- [ ] Firestore listener errors are surfaced without crashing the page.
- [ ] Slow network shows loading states rather than blank screens.
- [ ] Refreshing during form submission does not create duplicate records.
- [ ] Repeated rapid clicks do not duplicate deposits, withdrawals, approvals, messages, or funding.
- [ ] Back/forward browser navigation preserves safe state.
- [ ] Realtime listeners unsubscribe cleanly when leaving pages.

## 25. Mobile App Under `nal-gm`

- [ ] `cd nal-gm && npm install` succeeds from a clean checkout.
- [ ] `cd nal-gm && npm run lint` or available validation command succeeds.
- [ ] Expo app starts and renders the initial route.
- [ ] Firebase config points to the intended project.
- [ ] Admin repayments screen loads data correctly.
- [ ] Mobile navigation works across enabled screens.
- [ ] Mobile app handles auth/session state correctly if auth is enabled.
- [ ] Mobile UI works on small Android and iOS screen sizes.
- [ ] Mobile app handles offline and slow network states.

## 26. Regression Smoke Test

- [ ] Create a new client.
- [ ] Client submits a deal request.
- [ ] Admin approves the deal request.
- [ ] Admin funds the deal.
- [ ] Client views funded deal and repayment schedule.
- [ ] Investor submits a deposit.
- [ ] Admin approves the deposit.
- [ ] Investor sees updated balance/transactions.
- [ ] Client or admin sends a message.
- [ ] Recipient receives message and notification.
- [ ] Admin processes a repayment.
- [ ] Dashboard metrics update for admin, client, and investor.
- [ ] Sign out and sign back in as each role.

## 27. Release Sign-Off

- [ ] Typecheck passes.
- [ ] Production build passes.
- [ ] Firebase rules reviewed and tested.
- [ ] Cloud functions deployed or staged successfully.
- [ ] Firestore indexes deployed or verified.
- [ ] Critical role journeys pass.
- [ ] Known failures are documented with issue links or owner names.
- [ ] Test data cleanup plan is complete.
- [ ] Version, commit SHA, environment, and tester name are recorded.
