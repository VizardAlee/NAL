import { z } from 'zod';

const partySchema = z.object({
  name: z.string().default(''), email: z.string().default(''), phoneNumber: z.string().default(''), address: z.string().default(''),
  accountType: z.enum(['Individual', 'Organization']).default('Individual'), organizationRegistrationNumber: z.string().default(''),
  bankName: z.string().default(''), bankAccountName: z.string().default(''), bankAccountNumberLast4: z.string().default(''), isMuslim: z.boolean().optional(),
});
const investorAllocationSchema = z.object({
  fundPositionId: z.string().optional(),
  investorId: z.string().optional(), investorName: z.string().default(''), amountInvested: z.number().default(0), realisedProfit: z.number().default(0), principalReturned: z.number().default(0),
});
const dealSchema = z.object({
  id: z.string().default(''), dealName: z.string().default(''), clientId: z.string().optional(), clientName: z.string().default(''),
  state: z.enum(['ONGOING', 'COMPLETED']).default('ONGOING'), financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).default('Murabaha'),
  principal: z.number().default(0), profitRate: z.number().default(0), managementFeeAmount: z.number().default(0), startDate: z.string().default(''), completionDate: z.string().optional(),
  durationValue: z.number().default(0), durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']).default('Months'),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']).default('Monthly'), amountPaid: z.number().default(0), documentedOutstanding: z.number().default(0),
  paymentEvidence: z.array(z.object({ amount: z.number().finite().min(0.01), date: z.string().date(), reference: z.string().default(''), documentName: z.string().default('') })).max(200).default([]),
  investors: z.array(investorAllocationSchema).default([]),
});
export const historicalExtractionSchema = z.object({
  party: partySchema,
  deals: z.array(dealSchema).default([]),
  fundPositions: z.array(z.object({
    id: z.string().optional(), historyComplete: z.boolean().default(false),
    transactions: z.array(z.object({type:z.enum(['Deposit','Withdrawal','ProfitDistribution','PrincipalReturn']),amount:z.number().finite().positive(),date:z.string().date(),reference:z.string().default(''),documentName:z.string().default(''),dealId:z.string().optional()})).max(200).default([]),
    investmentTerms: z.object({
      capitalCommitted: z.number().finite().nonnegative(),
      agreementDate: z.string().date(), paymentDate: z.string().date(), maturityDate: z.string().date(),
      tenureValue: z.number().int().positive(), tenureUnit: z.enum(['Days', 'Months', 'Years']),
      investorProfitShare: z.number().min(0).max(100), companyProfitShare: z.number().min(0).max(100),
      paymentReference: z.string().default(''), capitalLockedUntilMaturity: z.boolean(),
      annualProfitWithdrawalPercent: z.number().min(0).max(100), annualWithdrawalWindowDays: z.number().int().min(0).max(366),
    }).optional(),
    balancesVerified: z.boolean().default(false), balanceEvidence: z.string().default(''),
    investorId: z.string().optional(), investorName: z.string().default(''), totalDeposited: z.number().default(0), totalAllocated: z.number().default(0),
    totalWithdrawn: z.number().default(0), principalReturned: z.number().default(0), realisedProfit: z.number().default(0), availableCapital: z.number().default(0),
  })).default([]),
  expenses: z.array(z.object({ description: z.string().default(''), amount: z.number().default(0), date: z.string().optional(), reference: z.string().optional() })).default([]),
  notes: z.array(z.string()).default([]), confidence: z.number().min(0).max(1).default(0),
});

// Gemini's grammar compiler rejects this nested financial schema with maxItems
// and numeric/date constraints. Keep JSON mode and explicit schema instructions,
// but enforce the complete schema here rather than as a provider constraint.
export const historicalExtractionOutput = {
  schema: historicalExtractionSchema,
  constrained: false,
  instructions: true,
};

export function historicalExtractionForStorage(value: unknown) {
  const extraction = JSON.parse(JSON.stringify(historicalExtractionSchema.parse(value))) as z.infer<typeof historicalExtractionSchema>;
  extraction.fundPositions = extraction.fundPositions.map((position,index) => ({...position,id:position.id || `fund-${index+1}`}));
  return extraction;
}
