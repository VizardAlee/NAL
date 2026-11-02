import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { reconcileMarketingReceiptChange } from './marketing-fund-core';

/** Internal allocations only. Never changes receipts, client debt or external money. */
export const reconcileMarketingReceipt = onDocumentWritten({ document: 'repayments/{repaymentId}', retry: true }, async event => {
  if (!event.data) return;
  await reconcileMarketingReceiptChange(admin.firestore(), event.data.before.data(), event.data.after.data(), event.id);
});
