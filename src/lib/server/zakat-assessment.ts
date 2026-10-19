import { FieldValue, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';
import { isZakatApplicable } from '@/lib/zakat-eligibility';
import { calculateInvestorPortfolioValue, roundCurrency } from '@/lib/financial-integrity';
import { calculateZakatAmount, isZakatDue } from '@/lib/zakat';

/** All assessment inputs and the annual guard share one serializable transaction.
 * Query reads also protect against newly inserted ledger rows on a retry.
 */
export async function assessInvestorZakat(db: Firestore, userRef: DocumentReference) {
  return db.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data();
    if (!userSnapshot.exists || !isZakatApplicable(user)) return { status: 'skipped', amount: 0 };
    const settings = await transaction.get(db.doc('platformSettings/zakat'));
    const nisab = Number(settings.data()?.nisab || 0);
    if (!Number.isFinite(nisab) || nisab <= 0) return { status: 'skipped', amount: 0 };
    const ledger = await transaction.get(db.collection('transactions').where('userId', '==', userRef.id));
    const rows = ledger.docs.map(doc => doc.data());
    const firstDepositDate = rows.filter(row => row.type === 'Deposit' && row.createdAt?.toDate)
      .map(row => row.createdAt.toDate() as Date).sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const lastAssessment = user?.lastZakatAssessmentDate?.toDate?.() || user?.lastZakatPaymentDate?.toDate?.() || null;
    if (!isZakatDue({ firstDepositDate, lastAssessmentDate: lastAssessment })) return { status: 'skipped', amount: 0 };
    const portfolioValue = calculateInvestorPortfolioValue(rows);
    const amount = calculateZakatAmount(portfolioValue, nisab);
    if (amount <= 0) {
      transaction.update(userRef, { lastZakatAssessmentDate: FieldValue.serverTimestamp() });
      return { status: 'belowNisab', amount: 0 };
    }
    const batches = await transaction.get(db.collection('fundBatches').where('sourceId', '==', userRef.id));
    const balance = roundCurrency(batches.docs.reduce((sum, doc) => sum + Number(doc.data().remainingAmount || 0), 0));
    if (balance < amount) {
      const lastNotice = user?.lastZakatFundingNoticeDate?.toDate?.() || null;
      const shouldNotify = !lastNotice || differenceInDays(new Date(), lastNotice) >= 7;
      if (shouldNotify) transaction.update(userRef, { lastZakatFundingNoticeDate: FieldValue.serverTimestamp() });
      return { status: 'insufficient', amount, shouldNotify };
    }
    // Preserve the existing FIFO eligibility query (including its date-field
    // requirement); move its inputs into this transaction without widening it.
    const available = await transaction.get(db.collection('fundBatches')
      .where('sourceId', '==', userRef.id).where('remainingAmount', '>', 0).orderBy('createdAt', 'asc'));
    let remaining = amount;
    for (const batch of available.docs) {
      if (remaining <= 0) break;
      const deduction = roundCurrency(Math.min(remaining, Number(batch.data().remainingAmount)));
      transaction.update(batch.ref, { remainingAmount: FieldValue.increment(-deduction) });
      remaining = roundCurrency(remaining - deduction);
    }
    if (remaining > 0) throw new Error('Full Zakat amount could not be deducted.');
    transaction.set(db.collection('transactions').doc(), {
      userId: userRef.id, type: 'Zakat', amount: -amount, createdAt: FieldValue.serverTimestamp(),
      details: 'Annual Zakat Payment (Automatic)', metadata: { rate: 0.025, nisab, portfolioValue, mode: 'automatic' },
    });
    transaction.update(userRef, {
      lastZakatAssessmentDate: FieldValue.serverTimestamp(), lastZakatPaymentDate: FieldValue.serverTimestamp(),
      lastZakatFundingNoticeDate: FieldValue.delete(),
    });
    return { status: 'paid', amount };
  });
}
