# Marketer commission and revolving marketing pool

## Agreed rules

Only newly created, non-historical Murabaha contracts with `marketingCommissionPolicy: 1` participate. Existing documents are not backfilled. Genuinely backdated or signing-waived direct creations are excluded. A fully executed Murabaha signature transaction creates a single obligation keyed by deal ID, using the immutable signed document's profit, profit rate, contract repayment price and hash. Commission is 5% of agreed profit, rounded half up in kobo. Unsigned contracts earn nothing.

Earned minus paid is the marketer's unpaid commission. Paid minus replenished is company funding still awaiting replenishment. These are separate balances. Termination does not cancel either earned commission or client debt, and there is no marketer clawback. The existing finance settlement workflow still decides the actual settlement collection.

## Administrator flow

Open **Platform Funds → Marketing fund and commissions** (`/admin/marketing`). Existing administrator onboarding and persona controls remain authoritative. No migration creates users, grants roles, sends invitations or issues credentials.

1. Select an available company/platform fund batch, classify its documented source as retained earnings or company shareholder capital, and record the source evidence and amount. The action deducts fundable availability atomically and reserves the amount in the marketing pool. Investor batches and personal owner allocation batches cannot be selected. Classification is evidence supplied by the administrator; it is not an inferred new shareholder loan.
2. Assign a contract's current marketer using the assignment control. The existing deal creation marketer selector remains available. This assignment is also that marketer's membership of the client's recovery team for that specific contract; it does not grant the general RECOVERY persona. A client with several contracts may have different marketers per contract. Reassignment takes effect against authoritative deal data and never transfers an already earned commission.
3. After a commission payment has been made and verified outside the app, select the signed obligation and record its amount and unique external reference. There is no bank/payment integration. A transaction prevents payment beyond either available pool cash or unpaid earned commission. Requests retain operation IDs on retry, and the normalized external reference is globally unique for commission payments.
4. The existing authorized repayment approval transaction replenishes the pool atomically with receipt posting, repayment allocations and financial ledgers. Confirmed termination settlement uses the same hook. No separate client charge is added.
5. An authorized finance correction that changes a repayment to `Reversed`/`Refunded`, changes its cumulative `refundedAmount`, deletes it, or changes its contract relationship automatically wakes the retryable `reconcileMarketingReceipt` Function. It recomputes current state for both affected contracts. Delayed/duplicate deliveries cannot replay old amounts. Every commission payment also checks all paid obligations against current receipts in its transaction and refuses spending while any allocation is stale, covering event-delivery delay. **Reconcile cleared receipts** remains an administrator retry/diagnostic control, rather than a required correctness step.

The existing app has no general bank-refund authorization workflow. This feature does not create one, infer a client-debt reversal from a contact note, or change confirmed client balances. The source repayment record must first reflect the authorized finance correction and its existing financial counterentries. This feature then safely corrects its own internal allocation automatically; it never executes a bank refund. A future finance correction action can call the same shared preparation helper in its transaction to avoid asynchronous delay altogether. Original receipt amounts and prior marketing events remain unchanged; adjustments append events.

## Accounting integration

Source allocations use existing `TransferFromInvestible` administrative ledger entries. Commission payments use the existing administrative `Expense` policy, with `expenseType: MARKETER_COMMISSION`. The signed but unpaid obligation is tracked separately. This follows the application's existing expense-on-payment reporting; no capitalization policy or owner-profit policy is introduced.

Replenishments are internal `TransferFromInvestible` allocations, not income or another expense. The new receipt's platform cash batch is reduced by the amount reserved for the pool, so the same cash is not simultaneously fundable and reserved. Reconciliation/late funding deducts available company cash. Negative adjustments return the previous internal designation to platform availability and debit the pool, even when this creates a visible pool deficit. The administrator must pair any underlying finance reversal with its existing financial counterentries; marketing reconciliation alone is not a financial reversal. General administrative availability shown on Platform Funds excludes a positive marketing reserve. Existing Platform Funds transfers now use authenticated server transactions: current batch availability is re-read inside the transaction, and transfers into investible capital cannot spend reserved marketing cash. All direct-browser fund-batch creation/update is denied, including the previous administrative transfer bypass. Transfer retries retain an operation ID and are idempotent. A deterministic regression reproduces the reviewed 100k stale read / 60k reservation / 80k attempted transfer and verifies rejection against the remaining 40k.

A reversal can make the pool negative if previously recovered money was reused. The shortfall stays visible and blocks further commission payments until company funding covers it; it does not erase recovery history or block the negative adjustment. A late commission payment that requires recovery from already collected instalments needs available company cash backing; otherwise it fails atomically with an explicit insufficient-cash message. An already valid collection or settlement never fails because of a marketing cash-backing shortage: available cash is allocated, the remainder is recorded as `pendingReplenishmentKobo` with an audit event, and retryable reconciliation completes it when cash is available. Pending or stale allocations pause further commission payments.

## Exact allocation

`target = round_half_up(actual_paid_commission × min(net_approved_contract_receipts, signed_contract_repayment) / signed_contract_repayment)`

Only the delta from the previous target is posted. Net receipts use the existing authorized `Approved` repayment records for the one deal; pending/rejected/reversed/refunded records contribute zero. A partial refund reduces that approved receipt by its cumulative `refundedAmount`. The denominator is the signed Murabaha contract price, excluding management fees and deposits. Integer-kobo arithmetic and BigInt multiplication avoid fractional accumulation and unsafe intermediate multiplication. The final cumulative target exactly equals the funded commission at full repayment.

Fictional example: funded commission ₦50,000 / contract ₦3,000,000. A ₦300,000 cleared receipt replenishes ₦5,000; retry does not change it; a half refund reduces it to ₦2,500. Three ₦1m receipts produce cumulative targets ₦16,666.67, ₦33,333.33 and ₦50,000.00. With only ₦20,000 paid, 10% collected replenishes ₦2,000. Further commission payment catches up the target against prior receipts without double counting.

## Marketer flow and access

Marketers use the existing individual login and Marketer portal. The server derives their UID from a revocation-checked ID token and current profile. It returns only current assigned contract/client contact projections, that marketer's commission totals/history and those contracts' recovery task summaries. A previous assignment's commission remains visible as “Previous assignment,” without client details. Referral codes do not confer current client access. Full Firestore deal/client/commission/pool/recovery documents remain unavailable to a marketer through direct SDK/REST APIs.

A marketer can record a follow-up or promise on a task for a currently assigned contract even when a separate recovery officer owns the case. This appends an immutable case log and separate marketer follow-up/promise fields. It does not change the officer, legal workflow stage, client balance or confirmed payments. `PAYMENT_CONFIRMED` is not accepted by the marketer endpoint. Reassignment is rechecked inside the mutation transaction. Existing recovery officers see the appended notes in their case timeline.

## Validation and held deployment

- `npm run test:unit`
- `npm run test:marketing` (isolated `demo-nal-acceptance` loopback Firebase emulators)
- `npm run test:marketing:acceptance` (same fixtures plus production build and 1440px/390px browser journeys)
- `npm run test:rules`, `npm run typecheck`, `npm run lint`, `npm run build --prefix functions`, `npm run build`

The runner rejects production project IDs, non-loopback emulator hosts and managed live runtimes. It clears inherited server credential selectors for its child process. All identities, receipts and references are fictional. No local `.env.local` from the production checkout is used.

Release must stay on the feature branch as a draft PR. The shared allocation implementation lives in `functions/src/marketing-fund-core.ts` and is used by both App Hosting actions and the receipt-change Function, avoiding divergent money logic. App Hosting source packaging includes `functions/src` for these imports while excluding its compiled output and dependencies. The Functions export and held deployment workflow include `reconcileMarketingReceipt`; it must be included in the reviewed release.

Existing `main` push workflow deploys Firebase and App Hosting `nal-web`, so do not merge or deploy until the parent confirms independent money/access review and the exact release gate. No PR approval is authorized. No production financial records or real-user access changes are required. Existing untracked work in the original checkout is intentionally preserved.
