import { roundCurrency } from './financial-integrity';

export const NIGERIA_TAX_2026_EFFECTIVE_DATE = new Date('2026-01-01T00:00:00.000Z');
export const SMALL_COMPANY_TURNOVER_THRESHOLD = 100_000_000;
export const SMALL_COMPANY_FIXED_ASSET_THRESHOLD = 250_000_000;
export const STANDARD_COMPANY_CIT_RATE = 0.30;
export const DEVELOPMENT_LEVY_RATE = 0.04;
export const MINIMUM_ETR_RATE = 0.15;
export const MINIMUM_ETR_TURNOVER_THRESHOLD = 50_000_000_000;
export const VAT_RATE = 0.075;

export function calculateCompanyTax2026(input: {
  turnover: number;
  fixedAssets: number;
  assessableProfit: number;
  totalProfits: number;
  auditedNetIncome: number;
  isNonResidentCompany?: boolean;
  isMneGroupEntity?: boolean;
  prioritySectorTaxCredit?: number;
}) {
  const turnover = Math.max(0, roundCurrency(input.turnover));
  const fixedAssets = Math.max(0, roundCurrency(input.fixedAssets));
  const assessableProfit = Math.max(0, roundCurrency(input.assessableProfit));
  const totalProfits = Math.max(0, roundCurrency(input.totalProfits));
  const auditedNetIncome = Math.max(0, roundCurrency(input.auditedNetIncome));
  const prioritySectorTaxCredit = Math.max(0, roundCurrency(input.prioritySectorTaxCredit || 0));
  const isNonResidentCompany = Boolean(input.isNonResidentCompany);

  const qualifiesAsSmallCompany =
    !isNonResidentCompany &&
    turnover <= SMALL_COMPANY_TURNOVER_THRESHOLD &&
    fixedAssets <= SMALL_COMPANY_FIXED_ASSET_THRESHOLD;
  const citRate = qualifiesAsSmallCompany ? 0 : STANDARD_COMPANY_CIT_RATE;
  const developmentLevyRate =
    qualifiesAsSmallCompany || isNonResidentCompany ? 0 : DEVELOPMENT_LEVY_RATE;
  const companyIncomeTax = roundCurrency(totalProfits * citRate);
  const developmentLevy = roundCurrency(assessableProfit * developmentLevyRate);
  const minimumEtrApplies =
    Boolean(input.isMneGroupEntity) || turnover >= MINIMUM_ETR_TURNOVER_THRESHOLD;
  const coveredTaxesBeforeTopUp = roundCurrency(
    companyIncomeTax + developmentLevy + prioritySectorTaxCredit
  );
  const minimumEtrBenchmark = minimumEtrApplies
    ? roundCurrency(auditedNetIncome * MINIMUM_ETR_RATE)
    : 0;
  const minimumEtrTopUp = minimumEtrApplies
    ? Math.max(0, roundCurrency(minimumEtrBenchmark - coveredTaxesBeforeTopUp))
    : 0;

  return {
    turnover,
    fixedAssets,
    qualifiesAsSmallCompany,
    category: qualifiesAsSmallCompany ? 'Small Company' : 'Standard Company',
    citRate,
    developmentLevyRate,
    companyIncomeTax,
    developmentLevy,
    prioritySectorTaxCredit,
    coveredTaxesBeforeTopUp,
    auditedNetIncome,
    minimumEtrApplies,
    minimumEtrBenchmark,
    minimumEtrTopUp,
    grossCorporateTaxDue: roundCurrency(
      companyIncomeTax + developmentLevy + minimumEtrTopUp
    ),
  };
}

export function calculateVat2026(input: {
  recordedStandardRatedSupplies?: number;
  additionalStandardRatedSupplies?: number;
  eligibleInputVat?: number;
}) {
  const standardRatedSupplies = roundCurrency(
    Math.max(0, input.recordedStandardRatedSupplies || 0) +
      Math.max(0, input.additionalStandardRatedSupplies || 0)
  );
  const outputVat = roundCurrency(standardRatedSupplies * VAT_RATE);
  const eligibleInputVat = Math.max(0, roundCurrency(input.eligibleInputVat || 0));
  return {
    standardRatedSupplies,
    outputVat,
    eligibleInputVat,
    vatPayable: Math.max(0, roundCurrency(outputVat - eligibleInputVat)),
    vatCredit: Math.max(0, roundCurrency(eligibleInputVat - outputVat)),
  };
}

export type WhtCategory =
  | 'DIVIDEND_INTEREST'
  | 'ROYALTY'
  | 'RENT_HIRE_LEASE'
  | 'PROFESSIONAL_FEES'
  | 'SUPPLY_OF_GOODS'
  | 'TELECOM_TOWER_SERVICES'
  | 'OTHER_SERVICES'
  | 'ROAD_BRIDGE_BUILDING_POWER_CONSTRUCTION'
  | 'OTHER_CONSTRUCTION'
  | 'BROKERAGE'
  | 'DIRECTORS_FEES'
  | 'LOSS_OF_EMPLOYMENT_COMPENSATION'
  | 'ENTERTAINERS_SPORTSPERSONS'
  | 'WINNINGS';

export type WhtRecipientType = 'CORPORATE' | 'NON_CORPORATE';
export type WhtResidence = 'RESIDENT' | 'NON_RESIDENT';

export const WHT_CATEGORY_LABELS: Record<WhtCategory, string> = {
  DIVIDEND_INTEREST: 'Dividend or interest',
  ROYALTY: 'Royalty',
  RENT_HIRE_LEASE: 'Rent, hire or lease',
  PROFESSIONAL_FEES: 'Commission, consultancy, technical, management or professional fees',
  SUPPLY_OF_GOODS: 'Supply of goods/materials (not manufacturer/producer)',
  TELECOM_TOWER_SERVICES: 'Co-location or telecom tower services',
  OTHER_SERVICES: 'Other services',
  ROAD_BRIDGE_BUILDING_POWER_CONSTRUCTION: 'Road, bridge, building or power-plant construction',
  OTHER_CONSTRUCTION: 'Other construction and related activities',
  BROKERAGE: 'Brokerage fee',
  DIRECTORS_FEES: 'Directors’ fees',
  LOSS_OF_EMPLOYMENT_COMPENSATION: 'Compensation for loss of employment',
  ENTERTAINERS_SPORTSPERSONS: 'Entertainers and sportspersons',
  WINNINGS: 'Lottery, gaming or reality-show winnings',
};

const WHT_RATES: Record<
  WhtCategory,
  Record<WhtRecipientType, Record<WhtResidence, number | null>>
> = {
  DIVIDEND_INTEREST: {
    CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
  },
  ROYALTY: {
    CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 5, NON_RESIDENT: 5 },
  },
  RENT_HIRE_LEASE: {
    CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
  },
  PROFESSIONAL_FEES: {
    CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
  },
  SUPPLY_OF_GOODS: {
    CORPORATE: { RESIDENT: 2, NON_RESIDENT: null },
    NON_CORPORATE: { RESIDENT: 2, NON_RESIDENT: null },
  },
  TELECOM_TOWER_SERVICES: {
    CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
    NON_CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
  },
  OTHER_SERVICES: {
    CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
    NON_CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
  },
  ROAD_BRIDGE_BUILDING_POWER_CONSTRUCTION: {
    CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
    NON_CORPORATE: { RESIDENT: 2, NON_RESIDENT: 5 },
  },
  OTHER_CONSTRUCTION: {
    CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
  },
  BROKERAGE: {
    CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
    NON_CORPORATE: { RESIDENT: 5, NON_RESIDENT: 10 },
  },
  DIRECTORS_FEES: {
    CORPORATE: { RESIDENT: null, NON_RESIDENT: null },
    NON_CORPORATE: { RESIDENT: 15, NON_RESIDENT: 20 },
  },
  LOSS_OF_EMPLOYMENT_COMPENSATION: {
    CORPORATE: { RESIDENT: null, NON_RESIDENT: null },
    NON_CORPORATE: { RESIDENT: 10, NON_RESIDENT: 10 },
  },
  ENTERTAINERS_SPORTSPERSONS: {
    CORPORATE: { RESIDENT: null, NON_RESIDENT: 15 },
    NON_CORPORATE: { RESIDENT: null, NON_RESIDENT: 15 },
  },
  WINNINGS: {
    CORPORATE: { RESIDENT: null, NON_RESIDENT: null },
    NON_CORPORATE: { RESIDENT: 5, NON_RESIDENT: 15 },
  },
};

const PASSIVE_WHT_CATEGORIES = new Set<WhtCategory>([
  'DIVIDEND_INTEREST',
  'ROYALTY',
  'RENT_HIRE_LEASE',
]);

export function calculateWhtDeduction2026(input: {
  category: WhtCategory;
  recipientType: WhtRecipientType;
  residence: WhtResidence;
  grossAmount: number;
  hasTaxId: boolean;
  payerQualifiesAsSmallCompany?: boolean;
  monthlySupplierTransactionValue?: number;
  treatyRate?: number | null;
}) {
  const grossAmount = Math.max(0, roundCurrency(input.grossAmount));
  const statutoryRate = WHT_RATES[input.category][input.recipientType][input.residence];
  if (statutoryRate === null) {
    return { grossAmount, statutoryRate: null, effectiveRate: 0, amount: 0, reason: 'Not applicable for this recipient profile.' };
  }
  const monthlySupplierTransactionValue = Math.max(
    grossAmount,
    roundCurrency(input.monthlySupplierTransactionValue || 0)
  );
  if (
    input.payerQualifiesAsSmallCompany &&
    input.hasTaxId &&
    monthlySupplierTransactionValue <= 2_000_000
  ) {
    return { grossAmount, statutoryRate, effectiveRate: 0, amount: 0, reason: 'Small-company monthly transaction exemption.' };
  }

  const treatyRate =
    input.residence === 'NON_RESIDENT' &&
    input.treatyRate != null &&
    Number.isFinite(input.treatyRate) &&
    input.treatyRate >= 0
      ? Math.min(statutoryRate, input.treatyRate)
      : null;
  let effectiveRate = treatyRate ?? statutoryRate;
  if (!input.hasTaxId && !PASSIVE_WHT_CATEGORIES.has(input.category)) {
    effectiveRate *= 2;
  }
  return {
    grossAmount,
    statutoryRate,
    effectiveRate,
    amount: roundCurrency((grossAmount * effectiveRate) / 100),
    reason: treatyRate != null
      ? 'Reduced treaty rate applied.'
      : !input.hasTaxId && !PASSIVE_WHT_CATEGORIES.has(input.category)
        ? 'Rate doubled because the recipient has no Tax ID.'
        : null,
  };
}
