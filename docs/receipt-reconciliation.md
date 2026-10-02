# Financial documents and bank reconciliation

## Configuration and privacy

`FINANCIAL_DOCUMENT_AI_ENABLED=true` enables Gemini extraction for financial documents,
including historical-import extraction. Leave unset/false until the operator confirms
the API project is using appropriate paid-service data-use terms and customer notice.
No billing or privacy verification is inferred from possession of an API key.
Manual receipt entry and structured bank CSV imports work without this flag.

Historical evidence uploads use the administrator-only `/api/historical-documents`
endpoint rather than browser-to-Storage writes. Files are validated by their contents;
registration, duplicate detection and the twelve-document cap are transaction-checked.
These uploads do not invoke Gemini or change financial balances.

`NAL_AI_MODEL` optionally overrides the existing `googleai/gemini-2.5-flash` default.
Use a supported Genkit model identifier and benchmark it before changing production.
Do not use a browser-exposed API key. The existing server-side secret is retained.

## Workflow

- Admin: **Bank Reconciliation** in the admin navigation.
- Client/investor: **Upload payment/contribution receipt** on the dashboard.
- Upload a JPEG, PNG or PDF (5 MB maximum). Receipt data is an editable draft.
- Confirm customer, deal, amount, payment date, reference and successful status.
- Repayment/contribution submissions create pending requests only. Existing signed
  agreement and financial eligibility checks still apply to approval.
- Admin uploads a statement, confirms its account and covered dates, and reviews
  every row against the original. CSV imports bypass AI. PDF/image extraction is
  only a draft; missing rows must be added before confirmation.
- Reconcile against a reviewed bank row and record a verification note.
- Approve the financial posting. Bank allocation and the receipt's posted state
  are committed atomically with the existing financial workflow.
- Disbursement/procurement approval records verified evidence only: it does not
  repeat the existing funding deduction, activate a pending deal, or buy an asset.
- Completed/terminated deal receipts and payments through a legacy opening cut-off
  are evidence only. Historical extraction can preserve individual receipt evidence
  alongside aggregate opening payments without crediting them again.

CSV example (save Excel exports to this format first):

```csv
date,amount,direction,reference,description,reversed
2026-09-30,50000.00,CREDIT,TRANSFER-123,Customer repayment,false
2026-09-30,100000.00,DEBIT,TRANSFER-124,Supplier procurement,false
```

## Safeguards and current boundaries

Private originals have no public Firebase download tokens. They are served through
an authenticated, no-cache API. Firestore/Storage client reads/writes are denied.
Uploads are hash-deduplicated; statement reference identities survive overlapping
uploads. Bank allocation is rechecked inside posting transactions, preventing two
approvals from consuming the same money. Ambiguous or unreferenced matches require
explicit human review. Reconciliation does not prove the uploaded statement itself
is genuine; administrators must obtain it from the bank.

Reversals are excluded from matching; a reversal after posting requires an audited
financial correction, not automatic deletion. Do not simply mark a posted entry
as reversed and assume customer/investor balances have been corrected.

This initial workflow attaches one receipt to one deal/request. It does not yet
split one uploaded receipt across several deals. Partial bank-row allocations
are supported across distinct receipts, capped by the bank-row amount. Existing
manual pending requests must be resolved before a new receipt repayment is created.
The workspace shows 100 receipts, 20 recent statements and 400 bank entries;
an admin date search loads older entries within three days of that date. Large
statements must be split into batches of at most 400 rows. Expanded receipt-history
server pagination remains a follow-up for customers exceeding this history window.
Raw bank-specific CSV headers are not guessed: convert them to the documented
format. Password-protected PDFs must be exported/unlocked by the administrator.

## Release acceptance

Run typecheck, lint, unit tests and emulator rules tests. Before production use,
validate with real consented examples: CSV and PDF statements, poor phone images,
duplicate files/references, overlapping statements, two concurrent allocations,
failed/pending transfers, wrong accounts, investor signature prerequisites,
legacy cut-offs and rejection. Confirm authenticated document access denies other
customers, staff and unauthenticated callers. No bank/live posting has been tested
merely by building this code.
