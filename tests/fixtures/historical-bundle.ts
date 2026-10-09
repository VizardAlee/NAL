import { historicalExtractionSchema } from '../../src/lib/server/historical-extraction-schema';

export function historicalBundle() {
  return historicalExtractionSchema.parse({
    party:{name:'Acceptance investor'},
    relatedParties:[{id:'customer-a',name:'Legacy Organisation',kind:'CLIENT',accountType:'Organization',representativeName:'Representative Person',representativeTitle:'Director',createNew:true,confirmed:true}],
    deals:[{id:'sale-a',dealName:'Legacy asset sale',clientName:'Legacy Organisation',clientId:'IMPORT:customer-a',state:'ONGOING',financingMode:'Murabaha',principal:1000,profitRate:10,startDate:'2026-09-01',durationValue:90,durationUnit:'Days',repaymentFrequency:'Daily',documentedOutstanding:1100,investors:[{investorId:'SELF',investorName:'Acceptance investor',fundPositionId:'fund-a',amountInvested:1000}]}],
    fundPositions:[{id:'fund-a',investorName:'Acceptance investor',investorId:'SELF',totalDeposited:2000,totalAllocated:1000,availableCapital:1000,balancesVerified:true,balanceEvidence:'Synthetic receipt and statement, no withdrawals or profit',investmentTerms:{capitalCommitted:2000,agreementDate:'2026-09-01',paymentDate:'2026-09-01',maturityDate:'2026-11-29',tenureValue:90,tenureUnit:'Days',investorProfitShare:40,companyProfitShare:60,paymentReference:'EMULATOR-ONLY-DEPOSIT',capitalLockedUntilMaturity:true,annualProfitWithdrawalPercent:20,annualWithdrawalWindowDays:5}}],
    agreementLinks:[
      {id:'agreement-investor',documentId:'doc-investor',type:'MUDARABA',fundPositionId:'fund-a',partyName:'Acceptance investor',evidence:'Synthetic original contribution agreement',confirmed:true},
      {id:'agreement-sale',documentId:'doc-sale',type:'MURABAHA',dealId:'sale-a',partyName:'Legacy Organisation',evidence:'Same customer, asset and original contract reference',confirmed:true},
      {id:'agreement-agency',documentId:'doc-agency',type:'WAKALAH',dealId:'sale-a',partyName:'Legacy Organisation',assetDescription:'Iron rods',supplierName:'Synthetic Supplier',evidence:'Same sale reference; procurement agency execution reviewed',confirmed:true},
      {id:'agreement-guarantee',documentId:'doc-guarantee',type:'KAFAALAH',dealId:'sale-a',partyName:'Legacy Organisation',guarantorName:'Synthetic Guarantor',guarantorAddress:'Synthetic Address',guarantorPhoneNumber:'08000000000',guarantorOccupation:'Trader',evidence:'Guarantee explicitly names the sale; execution reviewed',confirmed:true},
    ],
  });
}
