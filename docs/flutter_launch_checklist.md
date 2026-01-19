
✅ PHASE 1 — MUST PASS (BLOCKERS)

If any item here fails → do NOT launch publicly

1️⃣ **Authentication & Role Routing (CRITICAL)**

☐ User cannot access any screen without auth
☐ RoleRouter always resolves correctly (Admin, Investor, Client, Marketer, Legal, Recovery)
☐ No blank screen after login
☐ Logging out clears session fully
☐ Back button does not bypass auth
☐ Role-based screens are isolated (Client ≠ Investor ≠ Admin)

**Test**

- Login as Client → try to open Investor screen manually
- Kill app → reopen → session restores correctly

2️⃣ **Firestore Security Rules (ABSOLUTE MUST)**

☐ Users can read/write only their own documents
☐ Clients can only lodge repayments, not approve
☐ Investors cannot touch deals or repayments
☐ Admin-only collections locked properly
☐ No public read/write access anywhere

**Collections to double-lock**

- `/transactions`
- `/repayments`
- `/deals`
- `/investments`
- `/fundBatches`
- `/platformSettings`
- `/taxRecords`
- `/administrativeTransactions`
- `/assets`
- `/notifications`
- `/chatRequests` & `/conversations`
- `/recoveryTasks`

🚨 If this is not locked → app must NOT go live

3️⃣ **Payments & Money Integrity (FINTECH CORE)**

☐ Repayment always starts as `Pending`
☐ Only Admin approval triggers financial transactions
☐ Duplicate repayment detection works
☐ Partial payments handled correctly
☐ Rounding always up to 2 decimals
☐ Total repaid never exceeds expected
☐ Termination requests cannot be duplicated
☐ Management Fee payment logic is sound
☐ Admin fund transfers (Admin ↔ Investible) are atomic

**Test**

- Lodge same amount twice
- Lodge partial + full
- Approve then reject different orders

4️⃣ **Amortization Consistency (WEB ↔ MOBILE)**

☐ Profit model matches web app
☐ No "interest" wording anywhere
☐ Schedule shifts correctly after approval
☐ Fully paid installments disappear
☐ Part payments are clearly labelled
☐ Balloon payments behave correctly

5️⃣ **Investor Money Logic (VERY IMPORTANT)**

☐ Portfolio Value = Invested + Investible
☐ Investible Balance ≠ Portfolio Value
☐ Fund batches reduce correctly on investment
☐ Repayments replenish investible funds
☐ Zakat deduction logic is correct and FIFO
☐ No negative balances possible

---

✅ PHASE 2 — UX & STABILITY (STRONGLY RECOMMENDED)

6️⃣ **UI Stability (NO OVERFLOWS)**

☐ No RenderFlex overflow on any screen
☐ Works on small screens (e.g., iPhone SE)
☐ Long names don’t break layout
☐ Empty states are implemented everywhere (no data, errors, etc.)

7️⃣ **Core Screens Polish**

☐ Welcome/Onboarding screen looks premium
☐ Login/signup screens are consistent with branding
☐ Loading states (spinners/skeletons) are visible and not jarring
☐ Error messages are human-readable and user-friendly

8️⃣ **Admin Safety**

☐ Admin approvals cannot be done accidentally (e.g., no single-tap approvals)
☐ Confirm dialogs exist for critical actions (deleting users, deals, etc.)
☐ Audit trail exists (timestamps, user IDs on critical documents)

9️⃣ **Feature Parity (WEB ↔ MOBILE)**

☐ **Financing Modes:** `Murabaha` and `Ijara` logic correctly implemented if they differ.
☐ **Admin Funds Management:** Full UI for Administrative Account, including expenses, asset management, and transfers.
☐ **Messaging System:** Full real-time chat functionality between users and admins.
☐ **Marketer Functionality:** Dashboard with performance stats, referral code display, and list of referred users/deals.
☐ **Recovery & Legal Dashboards:** Dedicated views for these roles to manage tasks and log contacts.
☐ **AI Deal Analyzer:** A screen for users/admins to analyze financing proposals.
☐ **Notifications:** System for receiving in-app and push notifications for key events (new messages, approvals, etc.).
☐ **Platform Settings:** Admin screen to configure global settings like Zakat Nisab, bank details, and company logo.
☐ **Automated Jobs Verification:** Confirm that outcomes from automated Zakat payments, recovery task creation, and marketer rating updates are reflected correctly in the UI.

---

✅ PHASE 3 — PLAY STORE COMPLIANCE

🔟 **Build & Signing**

☐ Release keystore created and backed up
☐ `flutter build appbundle --release` works without errors
☐ VersionCode incremented from previous internal build
☐ VersionName set correctly (e.g., 1.0.0)

1️⃣1️⃣ **App Identity**

☐ App name is final (`NAL General Marchant`)
☐ App icon created for all resolutions (512×512 master)
☐ Splash screen designed and implemented
☐ Package name finalized (`com.nalmarchant.app` or similar)

1️⃣2️⃣ **Play Console Requirements**

☐ Privacy policy URL is live and accessible
☐ Data safety form completed accurately
☐ Contact email is verified
☐ App category set to "Finance"

1️⃣3️⃣ **Release Track Strategy**

Recommended:

✔ Internal Testing → You & core team
✔ Closed Testing → At least 20 trusted testers for 2 weeks
❌ Skip open testing
❌ Skip direct-to-production release
