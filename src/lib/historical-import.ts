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
  fundPositionId?: string;
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
  id?: string;
  transactions?: HistoricalFundTransaction[];
  historyComplete?: boolean;
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

export type HistoricalFundTransaction = {
  type: 'Deposit' | 'Withdrawal' | 'ProfitDistribution' | 'PrincipalReturn';
  amount: number;
  date: string;
  reference: string;
  documentName: string;
  dealId?: string;
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
  relatedParties?: HistoricalRelatedParty[];
  agreementLinks?: HistoricalAgreementLink[];
  party: {
    name: string;
    email?: string;
    phoneNumber?: string;
    address?: string;
    accountType: 'Individual' | 'Organization';
    organizationRegistrationNumber?: string;
    representativeName?: string;
    representativeTitle?: string;
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

export type HistoricalRelatedParty = HistoricalExtraction['party'] & {
  id: string; kind: HistoricalPartyKind; representativeName?: string; representativeTitle?: string;
  existingUserId?: string; createNew: boolean; confirmed: boolean;
};
export type HistoricalAgreementLink = {
  id: string; documentId: string; type: 'MUDARABA' | 'MURABAHA' | 'WAKALAH' | 'KAFAALAH' | 'OTHER';
  dealId: string; fundPositionId: string; reference: string; date: string; partyName: string;
  guarantorName: string; guarantorAddress: string; guarantorPhoneNumber: string; guarantorOccupation: string;
  assetDescription: string; supplierName: string; evidence: string; confirmed: boolean;
};

const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const validDate = (date:string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date;

export function reconcileHistoricalExtraction(extraction: HistoricalExtraction, cutoff?: string): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const references = new Set<string>();
  const checkEntry = (entry: {date: string; reference: string; amount: number; documentName: string}) => {
    if (!validDate(entry.date) || (cutoff && entry.date > cutoff)) issues.push({code:'INVALID_HISTORY_DATE',severity:'ERROR',message:'Every historical transaction needs a valid date on or before the snapshot cutoff.'});
    if (!(entry.amount > 0) || !Number.isFinite(entry.amount)) issues.push({code:'INVALID_HISTORY_AMOUNT',severity:'ERROR',message:'Historical transactions require positive finite amounts.'});
    if (!entry.documentName.trim()) issues.push({code:'HISTORY_EVIDENCE_REQUIRED',severity:'ERROR',message:'Identify the source document for each dated transaction.'});
    const reference = entry.reference.trim().toUpperCase();
    if (reference && references.has(reference)) issues.push({code:'DUPLICATE_HISTORY_REFERENCE',severity:'ERROR',message:`Transaction reference ${reference} is repeated across this import. Split a shared payment explicitly rather than crediting it twice.`});
    if (reference) references.add(reference);
  };
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
    evidence.forEach(checkEntry);
    if (cutoff && (deal.startDate > cutoff || (deal.completionDate && deal.completionDate > cutoff))) issues.push({code:'DEAL_AFTER_CUTOFF',severity:'ERROR',message:'Original start/completion dates cannot be after the snapshot cutoff.',dealId});
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
    if (!validDate(deal.startDate)) issues.push({ code: 'START_DATE_REQUIRED', severity: 'ERROR', message: `${deal.dealName || 'Deal'} needs its valid original start date.`, dealId });
    if (deal.completionDate && (!validDate(deal.completionDate) || deal.completionDate < deal.startDate)) issues.push({code:'INVALID_COMPLETION_DATE',severity:'ERROR',message:'Completion must be a valid date on or after the original start.',dealId});
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
    const allocationKeys = deal.investors.map(investor => `${investor.investorId}|${investor.fundPositionId || ''}`);
    if (new Set(allocationKeys).size !== allocationKeys.length) issues.push({code:'DUPLICATE_CONTRACT_ALLOCATION',severity:'ERROR',message:'Combine repeated allocations from the same investor contract within a deal.',dealId});
    deal.investors.forEach((investor) => {
      if (!Number.isFinite(investor.amountInvested) || investor.amountInvested <= 0 || !Number.isFinite(investor.realisedProfit) || investor.realisedProfit < 0 || !Number.isFinite(investor.principalReturned) || investor.principalReturned < 0 || investor.principalReturned > investor.amountInvested) issues.push({code:'INVALID_FUNDING_ALLOCATION',severity:'ERROR',message:'Funding must be positive; realised profit and returned principal must be valid non-negative amounts, with principal returns no greater than the original funding.',dealId});
      if (!investor.investorId) issues.push({ code: 'INVESTOR_LINK_REQUIRED', severity: 'ERROR', message: `Link ${investor.investorName || 'the investor'} to an account or platform capital.`, dealId });
      const contracts = extraction.fundPositions.filter(position => position.investorId && position.investorId === investor.investorId && (!investor.fundPositionId || position.id === investor.fundPositionId));
      if (investor.fundPositionId && contracts.length !== 1) issues.push({ code: 'INVALID_CONTRACT_LINK', severity: 'ERROR', message: 'Select a fund contract belonging to this investor.', dealId });
      if (contracts.length > 1) issues.push({ code: 'AMBIGUOUS_INVESTMENT_CONTRACT', severity: 'ERROR', message: 'Select the original fund contract for each client funding allocation.', dealId });
      if (investor.realisedProfit > 0 && investor.investorId !== 'platform' && contracts.length !== 1) issues.push({ code: 'PROFIT_CONTRACT_REQUIRED', severity: 'ERROR', message: 'Include the investor fund position and original contract so historical profit retains its withdrawal restrictions.', dealId });
      const datedProfit = (contracts[0]?.transactions || []).filter(entry => entry.type === 'ProfitDistribution' && entry.dealId === dealId).reduce((sum, entry) => sum + entry.amount, 0);
      if (datedProfit > investor.realisedProfit + 0.01) issues.push({code:'DEAL_PROFIT_HISTORY_MISMATCH',severity:'ERROR',message:'Dated profit exceeds the confirmed profit allocated to this deal and contract.',dealId});
    });
    const invested = money(deal.investors.reduce((sum, item) => sum + Number(item.amountInvested || 0), 0));
    if (deal.investors.length && Math.abs(invested - money(deal.principal)) > 1) {
      issues.push({ code: 'FUNDING_MISMATCH', severity: 'ERROR', message: `${deal.dealName || 'Deal'} investor allocations total ₦${invested.toLocaleString('en-NG')} instead of its ₦${money(deal.principal).toLocaleString('en-NG')} principal.`, dealId });
    }
  });

  extraction.fundPositions.forEach((position) => {
    const entries = position.transactions || [];
    entries.forEach(checkEntry);
    for (const entry of entries.filter(entry => entry.type === 'ProfitDistribution')) {
      const deal = extraction.deals.find(deal => deal.id === entry.dealId);
      if (!deal || !deal.investors.some(investor => investor.investorId === position.investorId && (!position.id || investor.fundPositionId === position.id || (!investor.fundPositionId && extraction.fundPositions.filter(item => item.investorId === position.investorId).length === 1)))) issues.push({code:'PROFIT_DEAL_LINK_REQUIRED',severity:'ERROR',message:'Every dated profit distribution must link to a deal funded by this contract.'});
    }
    if (entries.some(entry => position.investmentTerms && entry.date < position.investmentTerms.paymentDate)) issues.push({code:'TRANSACTION_BEFORE_CONTRIBUTION',severity:'ERROR',message:'Contract transactions cannot precede the original contribution date.'});
    for (const [type, total] of [['Deposit',position.totalDeposited],['Withdrawal',position.totalWithdrawn],['ProfitDistribution',position.realisedProfit],['PrincipalReturn',position.principalReturned]] as const) {
      const detailed = money(entries.filter(entry => entry.type === type).reduce((sum,entry) => sum+entry.amount,0));
      if (detailed > money(total) + 0.01 || (position.historyComplete && Math.abs(detailed-money(total)) > 0.01)) issues.push({code:'HISTORY_TOTAL_MISMATCH',severity:'ERROR',message:`${position.investorName}: dated ${type} entries must reconcile to their confirmed total.`});
    }
    if (cutoff && position.investmentTerms && position.investmentTerms.paymentDate > cutoff) issues.push({code:'CONTRIBUTION_AFTER_CUTOFF',severity:'ERROR',message:'An original contribution cannot be after the snapshot cutoff.'});
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
      const ninetyDay = durationToDays(terms.tenureValue, terms.tenureUnit) === 90;
      if (!terms.capitalLockedUntilMaturity || terms.investorProfitShare !== 40 || terms.companyProfitShare !== 60 || (!ninetyDay && (terms.annualProfitWithdrawalPercent !== 20 || terms.annualWithdrawalWindowDays !== 5))) issues.push({ code: 'UNSUPPORTED_INVESTMENT_RESTRICTIONS', severity: 'ERROR', message: 'Supported plans are 40/60 with capital at maturity: 90-day profit releases every completed 30 days, or longer-term annual 20%/five-day limits. Other contracts require a supported policy before posting.' });
    }
    if (position.availableCapital > (terms?.capitalCommitted || 0)) issues.push({ code: 'AVAILABLE_EXCEEDS_CONTRACT_CAPITAL', severity: 'ERROR', message: 'Unallocated capital exceeds the documented investment capital. Separate additional contributions/profit from this investment before posting.' });
    for (const field of ['totalDeposited', 'totalAllocated', 'totalWithdrawn', 'principalReturned', 'realisedProfit', 'availableCapital'] as const) {
      if (!Number.isFinite(position[field]) || position[field] < 0) issues.push({ code: 'INVALID_FUND_AMOUNT', severity: 'ERROR', message: `${field} must be a non-negative finite amount.` });
    }
    if (!position.investorId) issues.push({ code: 'FUND_OWNER_LINK_REQUIRED', severity: 'ERROR', message: `Link the fund position for ${position.investorName || 'the investor'} to an account.` });
    const expectedAvailable = money(position.totalDeposited + position.principalReturned + position.realisedProfit - position.totalAllocated - position.totalWithdrawn);
    const attributedProfit = extraction.deals.flatMap(deal => deal.investors).filter(investor => investor.investorId === position.investorId && (!position.id || investor.fundPositionId === position.id || (!investor.fundPositionId && extraction.fundPositions.filter(item => item.investorId === position.investorId).length === 1))).reduce((sum, investor) => sum + investor.realisedProfit, 0);
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
      .filter(investor => !position.id || investor.fundPositionId === position.id || (!investor.fundPositionId && extraction.fundPositions.filter(item => item.investorId === position.investorId).length === 1))
      .reduce((sum, investor) => sum + Number(investor.amountInvested || 0), 0));
    if (position.investorId && Math.abs(ongoingAllocated - money(position.totalAllocated)) > 1) {
      issues.push({
        code: 'ACTIVE_ALLOCATION_MISMATCH',
        severity: 'WARNING',
        message: `${position.investorName || 'Investor'} has ₦${ongoingAllocated.toLocaleString('en-NG')} allocated across imported ongoing deals, while the fund position states ₦${money(position.totalAllocated).toLocaleString('en-NG')}. Confirm whether all ongoing deals are included.`,
      });
    }
  });

  const positionIds = extraction.fundPositions.map(position => position.id).filter(Boolean);
  if (new Set(positionIds).size !== positionIds.length) issues.push({code:'DUPLICATE_CONTRACT_ID',severity:'ERROR',message:'Each fund contract needs a distinct identifier.'});
  const dealIds = extraction.deals.map(deal => deal.id);
  if (dealIds.some(id => !id.trim()) || new Set(dealIds).size !== dealIds.length) issues.push({code:'INVALID_DEAL_IDENTIFIERS',severity:'ERROR',message:'Each deal needs a distinct identifier for its dated history and funding links.'});
  for (const expense of extraction.expenses) {
    if (!Number.isFinite(expense.amount) || expense.amount <= 0 || (expense.date && (!Number.isFinite(Date.parse(expense.date)) || (cutoff && expense.date > cutoff)))) issues.push({code:'INVALID_HISTORICAL_EXPENSE',severity:'ERROR',message:'Expenses require positive amounts and original dates on or before the cutoff.'});
  }

  if (extraction.confidence < 0.75) {
    issues.push({ code: 'LOW_CONFIDENCE', severity: 'WARNING', message: 'Extraction confidence is low. Review every value against the uploaded documents.' });
  }
  return issues;
}

export function hasBlockingHistoricalIssues(issues: ReconciliationIssue[]) {
  return issues.some((issue) => issue.severity === 'ERROR');
}
