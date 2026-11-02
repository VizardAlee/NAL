"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileMarketingReceipt = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const marketing_fund_core_1 = require("./marketing-fund-core");
/** Internal allocations only. Never changes receipts, client debt or external money. */
exports.reconcileMarketingReceipt = (0, firestore_1.onDocumentWritten)({ document: 'repayments/{repaymentId}', retry: true }, async (event) => {
    if (!event.data)
        return;
    await (0, marketing_fund_core_1.reconcileMarketingReceiptChange)(admin.firestore(), event.data.before.data(), event.data.after.data(), event.id);
});
//# sourceMappingURL=marketing.js.map