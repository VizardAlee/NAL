import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileHistoricalExtraction, type HistoricalExtraction } from '../src/lib/historical-import';

function validExtraction(): HistoricalExtraction {
  return {
    party: { name: 'Test Client', accountType: 'Individual' },
    deals: [{
      id: 'deal-1', dealName: 'Legacy Murabaha', clientId: 'client-1', clientName: 'Test Client', state: 'ONGOING', financingMode: 'Murabaha',
      principal: 100_000, profitRate: 20, managementFeeAmount: 0, startDate: '2026-01-01', durationValue: 12, durationUnit: 'Months',
      repaymentFrequency: 'Monthly', amountPaid: 30_000, documentedOutstanding: 90_000,
      investors: [{ investorId: 'investor-1', investorName: 'Investor A', amountInvested: 100_000, realisedProfit: 2_000, principalReturned: 10_000 }],
    }],
    fundPositions: [], expenses: [], notes: [], confidence: 0.9,
  };
}

test('historical reconciliation accepts a balanced ongoing deal', () => {
  assert.deepEqual(reconcileHistoricalExtraction(validExtraction()).filter((issue) => issue.severity === 'ERROR'), []);
});

test('historical reconciliation blocks a completed deal with a balance', () => {
  const extraction = validExtraction();
  extraction.deals[0].state = 'COMPLETED';
  extraction.deals[0].completionDate = '2026-05-01';
  assert.ok(reconcileHistoricalExtraction(extraction).some((issue) => issue.code === 'COMPLETED_WITH_BALANCE'));
});

test('historical reconciliation detects an outstanding mismatch', () => {
  const extraction = validExtraction();
  extraction.deals[0].documentedOutstanding = 80_000;
  assert.ok(reconcileHistoricalExtraction(extraction).some((issue) => issue.code === 'OUTSTANDING_MISMATCH'));
});
