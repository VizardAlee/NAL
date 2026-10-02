import { durationToDays } from '@/lib/deal-duration';

export const HISTORICAL_IMPORT_SETTING_ID = 'historicalImports';

export type HistoricalImportStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'NEEDS_ATTENTION'
  | 'POSTING'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED';

export type HistoricalPartyKind = 'CLIENT' | 'INVESTOR' | 'BOTH';
export type HistoricalDealState = 'ONGOING' | 'COMPLETED';

export type HistoricalImportDocument = {
  id: string;
  storagePath: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt?: string;
};

export type HistoricalInvestorAllocation = {
  investorId?: string;
  investorName: string;
  amountInvested: number;
  realisedProfit: number;
  principalReturned: number;
};

export type HistoricalDealDraft = {
  id: string;
  dealName: string;
  clientId?: string;
  clientName: string;
  state: HistoricalDealState;
  financingMode: 'Murabaha' | 'Ijara' | 'Mudaraba';
  principal: number;
  profitRate: number;
  managementFeeAmount: number;
  startDate: string;
  completionDate?: string;
  durationValue: number;
  durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  repaymentFrequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly';
  amountPaid: number;
  // These receipts substantiate amountPaid; they never create additional ledger credits.
  paymentEvidence?: Array<{ amount: number; date: string; reference: string; documentName: string }>;
  documentedOutstanding: number;
  investors: HistoricalInvestorAllocation[];
};

export type HistoricalFundPosition = {
  // A contract describes committed capital, not the current reconciled balance.
  investmentTerms?: HistoricalInvestmentTerms;
  balancesVerified?: boolean;
  balanceEvidence?: string;
  investorId?: string;
  investorName: string;
  totalDeposited: number;
  totalAllocated: number;
  totalWithdrawn: number;
  principalReturned: number;
  realisedProfit: number;
  availableCapital: number;
};

export type HistoricalInvestmentTerms = {
  capitalCommitted: number;
  agreementDate: string;
  paymentDate: string;
  maturityDate: string;
  tenureValue: number;
  tenureUnit: 'Days' | 'Months' | 'Years';
  investorProfitShare: number;
  companyProfitShare: number;
  paymentReference: string;
  capitalLockedUntilMaturity: boolean;
  annualProfitWithdrawalPercent: number;
  annualWithdrawalWindowDays: number;
};

export type HistoricalExpenseDraft = {
  description: string;
  amount: number;
  date?: string;
  reference?: string;
};

export type HistoricalExtraction = {
  party: {
    name: string;
    email?: string;
    phoneNumber?: string;
    address?: string;
    accountType: 'Individual' | 'Organization';
    organizationRegistrationNumber?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumberLast4?: string;
    isMuslim?: boolean;
  };
  deals: HistoricalDealDraft[];
  fundPositions: HistoricalFundPosition[];
  expenses: HistoricalExpenseDraft[];
  notes: string[];
  confidence: number;
};

export type ReconciliationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  dealId?: string;
};

const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function reconcileHistoricalExtraction(extraction: HistoricalExtraction): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  if (!extraction.party.name.trim()) {
    issues.push({ code: 'PARTY_NAME_REQUIRED', severity: 'ERROR', message: 'Confirm the customer or investor name.' });
  }
  if (!extraction.deals.length && !extraction.fundPositions.length) {
    issues.push({ code: 'NO_FINANCIAL_RECORDS', severity: 'ERROR', message: 'Add at least one deal or investor fund position.' });
  }

  const seenDealNames = new Set<string>();
  extraction.deals.forEach((deal) => {
    const dealId = deal.id;
    const evidence = deal.paymentEvidence || [];
    if (money(evidence.reduce((sum, payment) => sum + payment.amount, 0)) > money(deal.amountPaid)) {
      issues.push({ code: 'EVIDENCE_EXCEEDS_OPENING_PAYMENTS', severity: 'ERROR', message: `${deal.dealName} receipt totals exceed its opening paid amount.`, dealId });
    }
    const references = evidence.map(payment => payment.reference.trim().toUpperCase()).filter(Boolean);
    if (new Set(references).size !== references.length) issues.push({ code: 'DUPLICATE_PAYMENT_EVIDENCE', severity: 'ERROR', message: `${deal.dealName} contains duplicate receipt references.`, dealId });
    const normalizedName = deal.dealName.trim().toLowerCase();
    if (!normalizedName) issues.push({ code: 'DEAL_NAME_REQUIRED', severity: 'ERROR', message: 'Every deal needs a name.', dealId });
    if (normalizedName && seenDealNames.has(normalizedName)) issues.push({ code: 'DUPLICATE_DEAL', severity: 'ERROR', message: `Duplicate deal name: ${deal.dealName}.`, dealId });
    seenDealNames.add(normalizedName);
    if (!Number.isFinite(deal.principal) || deal.principal <= 0) issues.push({ code: 'INVALID_PRINCIPAL', severity: 'ERROR', message: `${deal.dealName || 'Deal'} needs a positive principal.`, dealId });
    if (!Number.isFinite(deal.profitRate) || deal.profitRate < 0) issues.push({ code: 'INVALID_PROFIT_RATE', severity: 'ERROR', message: `${deal.dealName || 'Deal'} has an invalid profit rate.`, dealId });
    if (!deal.startDate) issues.push({ code: 'START_DATE_REQUIRED', severity: 'ERROR', message: `${deal.dealName || 'Deal'} needs its original start date.`, dealId });
    if (!deal.clientId) issues.push({ code: 'CLIENT_LINK_REQUIRED', severity: 'ERROR', message: `${deal.dealName || 'Deal'} must be linked to the correct client account.`, dealId });
    const contractAmount = money(deal.principal * (1 + deal.profitRate / 100));
    const calculatedOutstanding = money(Math.max(0, contractAmount - deal.amountPaid));
    if (Math.abs(calculatedOutstanding - money(deal.documentedOutstanding)) > 1) {
      issues.push({
        code: 'OUTSTANDING_MISMATCH',
        severity: 'ERROR',
        message: `${deal.dealName || 'Deal'} has a documented outstanding balance of ₦${money(deal.documentedOutstanding).toLocaleString('en-NG')}, but its terms and payments produce ₦${calculatedOutstanding.toLocaleString('en-NG')}.`,
        dealId,
      });
    }
    if (deal.state === 'COMPLETED' && deal.documentedOutstanding > 1) {
      issues.push({ code: 'COMPLETED_WITH_BALANCE', severity: 'ERROR', message: `${deal.dealName || 'Deal'} cannot be completed while a balance remains.`, dealId });
    }
    if (deal.state === 'COMPLETED' && !deal.completionDate) {
      issues.push({ code: 'COMPLETION_DATE_REQUIRED', severity: 'ERROR', message: `${deal.dealName || 'Deal'} needs a completion date.`, dealId });
    }
    if (!deal.investors.length) issues.push({ code: 'DEAL_FUNDING_REQUIRED', severity: 'ERROR', message: `${deal.dealName || 'Deal'} needs its investor or platform funding allocations.`, dealId });
    deal.investors.forEach((investor) => {
      if (!investor.investorId) issues.push({ code: 'INVESTOR_LINK_REQUIRED', severity: 'ERROR', message: `Link ${investor.investorName || 'the investor'} to an account or platform capital.`, dealId });
      const contracts = extraction.fundPositions.filter(position => position.investorId && position.investorId === investor.investorId);
      if (contracts.length > 1) issues.push({ code: 'AMBIGUOUS_INVESTMENT_CONTRACT', severity: 'ERROR', message: 'Split this import by original investment contract so each client funding allocation has one unambiguous source.', dealId });
      if (investor.realisedProfit > 0 && investor.investorId !== 'platform' && contracts.length !== 1) issues.push({ code: 'PROFIT_CONTRACT_REQUIRED', severity: 'ERROR', message: 'Include the investor fund position and original contract so historical profit retains its withdrawal restrictions.', dealId });
    });
    const invested = money(deal.investors.reduce((sum, item) => sum + Number(item.amountInvested || 0), 0));
    if (deal.investors.length && Math.abs(invested - money(deal.principal)) > 1) {
      issues.push({ code: 'FUNDING_MISMATCH', severity: 'ERROR', message: `${deal.dealName || 'Deal'} investor allocations total ₦${invested.toLocaleString('en-NG')} instead of its ₦${money(deal.principal).toLocaleString('en-NG')} principal.`, dealId });
    }
  });

  extraction.fundPositions.forEach((position) => {
    if (!position.balancesVerified || !position.balanceEvidence?.trim()) issues.push({ code: 'INVESTOR_BALANCES_UNVERIFIED', severity: 'ERROR', message: 'Verify the investor opening balances against receipts/statements and identify the evidence. An investment agreement alone does not establish allocations or available cash.' });
    const terms = position.investmentTerms;
    if (!terms) issues.push({ code: 'INVESTMENT_TERMS_REQUIRED', severity: 'ERROR', message: 'Confirm the original investment term and payment date before posting. Historical capital must not become an unrestricted zero-day investment.' });
    else {
      if (!(terms.capitalCommitted > 0) || !(terms.tenureValue > 0) || !terms.agreementDate || !terms.paymentDate || !terms.maturityDate || terms.maturityDate < terms.paymentDate) issues.push({ code: 'INVALID_INVESTMENT_TERMS', severity: 'ERROR', message: 'Confirm positive committed capital, the original investment dates, term and maturity.' });
      const span = (Date.parse(terms.maturityDate) - Date.parse(terms.paymentDate)) / 86400000 + 1;
      if (!Number.isFinite(span) || span < durationToDays(terms.tenureValue, terms.tenureUnit) || span > 3660) issues.push({ code: 'INVESTMENT_MATURITY_MISMATCH', severity: 'ERROR', message: 'The maturity date must cover the original investment term (maximum ten years). Check calendar-month/year dates against the contract.' });
      if (Math.abs(terms.investorProfitShare + terms.companyProfitShare - 100) > 0.01) issues.push({ code: 'INVALID_PROFIT_SHARES', severity: 'ERROR', message: 'Investor and company realised-profit shares must total 100%; they are not a fixed return rate.' });
      // Current withdrawal engines implement the platform standard. Never silently
      // import a different contract and then apply less restrictive default rules.
      if (!terms.capitalLockedUntilMaturity || terms.investorProfitShare !== 40 || terms.companyProfitShare !== 60 || terms.annualProfitWithdrawalPercent !== 20 || terms.annualWithdrawalWindowDays !== 5) issues.push({ code: 'UNSUPPORTED_INVESTMENT_RESTRICTIONS', severity: 'ERROR', message: 'These investment restrictions differ from the supported 40/60, capital-at-maturity and annual 20%/five-day policy. Do not post until the contract policy is supported.' });
    }
    if (position.availableCapital > (terms?.capitalCommitted || 0)) issues.push({ code: 'AVAILABLE_EXCEEDS_CONTRACT_CAPITAL', severity: 'ERROR', message: 'Unallocated capital exceeds the documented investment capital. Separate additional contributions/profit from this investment before posting.' });
    for (const field of ['totalDeposited', 'totalAllocated', 'totalWithdrawn', 'principalReturned', 'realisedProfit', 'availableCapital'] as const) {
      if (!Number.isFinite(position[field]) || position[field] < 0) issues.push({ code: 'INVALID_FUND_AMOUNT', severity: 'ERROR', message: `${field} must be a non-negative finite amount.` });
    }
    if (!position.investorId) issues.push({ code: 'FUND_OWNER_LINK_REQUIRED', severity: 'ERROR', message: `Link the fund position for ${position.investorName || 'the investor'} to an account.` });
    const expectedAvailable = money(position.totalDeposited + position.principalReturned + position.realisedProfit - position.totalAllocated - position.totalWithdrawn);
    const attributedProfit = extraction.deals.flatMap(deal => deal.investors).filter(investor => investor.investorId === position.investorId).reduce((sum, investor) => sum + investor.realisedProfit, 0);
    if (Math.abs(position.realisedProfit - attributedProfit) > 1) issues.push({ code: 'UNATTRIBUTED_INVESTOR_PROFIT', severity: 'ERROR', message: 'The fund-position profit must match its documented deal profit allocations. Do not post aggregate profit without the underlying attribution.' });
    if (Math.abs(expectedAvailable - money(position.availableCapital)) > 1) {
      issues.push({
        code: 'INVESTOR_BALANCE_MISMATCH',
        severity: 'ERROR',
        message: `${position.investorName || 'Investor'} available capital should reconcile to ₦${expectedAvailable.toLocaleString('en-NG')}.`,
      });
    }

    const ongoingAllocated = money(extraction.deals
      .filter((deal) => deal.state === 'ONGOING')
      .flatMap((deal) => deal.investors)
      .filter((investor) => investor.investorId === position.investorId)
      .reduce((sum, investor) => sum + Number(investor.amountInvested || 0), 0));
    if (position.investorId && Math.abs(ongoingAllocated - money(position.totalAllocated)) > 1) {
      issues.push({
        code: 'ACTIVE_ALLOCATION_MISMATCH',
        severity: 'WARNING',
        message: `${position.investorName || 'Investor'} has ₦${ongoingAllocated.toLocaleString('en-NG')} allocated across imported ongoing deals, while the fund position states ₦${money(position.totalAllocated).toLocaleString('en-NG')}. Confirm whether all ongoing deals are included.`,
      });
    }
  });

  if (extraction.confidence < 0.75) {
    issues.push({ code: 'LOW_CONFIDENCE', severity: 'WARNING', message: 'Extraction confidence is low. Review every value against the uploaded documents.' });
  }
  return issues;
}

export function hasBlockingHistoricalIssues(issues: ReconciliationIssue[]) {
  return issues.some((issue) => issue.severity === 'ERROR');
}
