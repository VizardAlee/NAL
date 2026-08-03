export const MURABAHA_AGREEMENT_VERSION = '1.0';

export type MurabahaScheduleRow = {
  installment: number;
  dueDate: string;
  openingBalance: number;
  profit: number;
  principal: number;
  payment: number;
  closingBalance: number;
};

export type MurabahaAgreementModel = {
  type: 'MURABAHA_SALE';
  version: string;
  agreementId: string;
  dealId: string;
  agreementDate: string;
  client: {
    id: string;
    name: string;
    address: string;
    email: string;
    phoneNumber: string;
    photoURL?: string;
  };
  guarantor: {
    name: string;
    address: string;
    phoneNumber: string;
    occupation: string;
  };
  company: {
    name: string;
    rcNumber: string;
    address: string;
    email: string;
    website: string;
    phoneNumbers: string;
    account: { accountName: string; accountNumber: string; bankName: string };
  };
  deal: {
    name: string;
    assetDescription: string;
    costPrice: number;
    profitRate: number;
    profit: number;
    contractPrice: number;
    durationValue: number;
    durationUnit: string;
    repaymentFrequency: string;
    installmentCount: number;
    installmentMinimum: number;
    installmentMaximum: number;
    managementFeeRate: number;
    managementFeeAmount: number;
    wakalahGranted: boolean;
    schedule: MurabahaScheduleRow[];
  };
  missingFields: string[];
};

export type MurabahaClause = { number: number; title: string; paragraphs: string[] };

function money(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(value);
}

export function buildMurabahaClauses(model: MurabahaAgreementModel): MurabahaClause[] {
  const { deal, company } = model;
  const paymentDescription = deal.installmentMinimum === deal.installmentMaximum
    ? `${deal.installmentCount} equal ${deal.repaymentFrequency.toLowerCase()} instalments of ${money(deal.installmentMaximum)}`
    : `${deal.installmentCount} ${deal.repaymentFrequency.toLowerCase()} instalments ranging from ${money(deal.installmentMinimum)} to ${money(deal.installmentMaximum)} due to exact kobo allocation`;
  return [
    {
      number: 1,
      title: 'ASSETS, COST AND CONTRACT PRICE',
      paragraphs: [
        `The Company shall purchase and sell to the Customer the following approved assets: ${deal.assetDescription}.`,
        `The total Cost Price is ${money(deal.costPrice)}. The disclosed Murabaha profit is ${money(deal.profit)}, being ${deal.profitRate}% of the Cost Price. The fixed Contract Price payable by the Customer is therefore ${money(deal.contractPrice)}.`,
        'The Contract Price shall not be increased merely because payment is delayed, except for any separately stated default penalty payable to charity under Clause 8.',
      ],
    },
    {
      number: 2,
      title: 'PAYMENT TERMS',
      paragraphs: [
        `The Customer shall pay the Contract Price in ${paymentDescription} over ${deal.durationValue} ${deal.durationUnit.toLowerCase()}, subject to the dated payment schedule attached to this Agreement.`,
        `The Customer shall also pay an upfront management and documentation fee of ${money(deal.managementFeeAmount)}, representing ${deal.managementFeeRate}% of the Cost Price. This fee is separate from the Contract Price and shall be clearly receipted.`,
        `All payments shall be made into the Company’s designated account: ${company.account.accountName}, ${company.account.bankName}, Account No. ${company.account.accountNumber}, or any replacement account formally notified by the Company in writing.`,
      ],
    },
    {
      number: 3,
      title: 'PURCHASE AGENCY AND DELIVERY',
      paragraphs: [
        deal.wakalahGranted
          ? 'The Customer has been separately appointed as the Company’s disclosed purchasing agent under a Wakalah agreement. The Customer shall purchase only the approved assets from approved suppliers and shall provide invoices, receipts and delivery evidence to the Company.'
          : 'The Customer has not been granted procurement authority under this Agreement. Where the Customer is later appointed as the Company’s disclosed purchasing agent, that appointment must be recorded under a separate Wakalah agreement before the Customer acquires any asset for the Company.',
        'Title to and risk in the assets shall pass to the Customer only after the Company has acquired the assets and completed the Murabaha sale to the Customer. The Company shall disclose the Cost Price and profit before the Customer becomes bound to purchase.',
        'The Customer shall inspect the assets on delivery and promptly notify the Company of any shortage, defect or non-conformity. Nothing in this Agreement excludes any non-excludable right or remedy under applicable Nigerian law.',
      ],
    },
    {
      number: 4,
      title: 'USE AND MAINTENANCE OF ASSETS',
      paragraphs: [
        'The Customer shall use, protect and maintain the assets responsibly, comply with manufacturer instructions and shall not sell, transfer, conceal, materially alter or create another security interest over the assets without the Company’s prior written consent while any amount remains outstanding.',
        'The Customer shall be responsible for liabilities arising from the Customer’s use, misuse or possession of the assets, except to the extent caused by the Company’s fraud, negligence, breach or any liability which cannot lawfully be excluded.',
      ],
    },
    {
      number: 5,
      title: 'SECURITY AND LIEN',
      paragraphs: [
        'The assets shall serve as security for the Customer’s payment obligations until the Contract Price and other lawful amounts due under this Agreement are fully paid.',
        'The Company may require reasonable additional security, a guarantor, post-dated cheques or other lawful security instruments. No unsigned or incomplete cheque shall be used except in accordance with the written security mandate and applicable law.',
        'The Company’s security interest and right of lien shall be exercised only in accordance with this Agreement and applicable law.',
      ],
    },
    {
      number: 6,
      title: 'DEFAULT AND NOTICE',
      paragraphs: [
        'A default occurs where the Customer fails to pay an instalment and the failure continues for thirty (30) days after its due date, provides materially false information, unlawfully disposes of or conceals the assets, or commits another material breach of this Agreement.',
        'Before repossession or enforcement, the Company shall, where reasonably practicable, issue a written default notice stating the breach, outstanding amount and a reasonable period to remedy the default, except where urgent action is reasonably necessary to preserve the assets or prevent fraud.',
      ],
    },
    {
      number: 7,
      title: 'REPOSSESSION AND SALE',
      paragraphs: [
        'Following an unremedied default, the Company may take lawful steps to repossess the assets. The Customer shall provide reasonable access and shall not obstruct a lawful repossession process.',
        'After repossession, the Company may sell the assets in a commercially reasonable manner. Sale proceeds shall be applied to reasonable repossession and sale costs, then to the outstanding Contract Price and other lawful amounts due. Any surplus shall be returned to the Customer, while any remaining shortfall shall remain payable by the Customer.',
        'The Company shall provide the Customer with a written statement showing the sale proceeds, deductions, balance applied and any surplus or shortfall.',
      ],
    },
    {
      number: 8,
      title: 'LATE-PAYMENT PENALTY FOR CHARITY',
      paragraphs: [
        'Where an instalment remains unpaid for more than thirty (30) days, the Customer may be charged a late-payment penalty of 1% per month on the overdue amount, solely as a deterrent and not as income or profit to the Company.',
        'Any amount collected under this Clause shall be separately recorded and applied to approved charitable purposes under the supervision of the Company’s Sharia advisory function. The Company may recover only its actual and reasonable enforcement costs where permitted by law.',
      ],
    },
    {
      number: 9,
      title: 'CUSTOMER PROCEEDS AND PAYMENT SOURCE',
      paragraphs: ['The Customer shall make payments from lawful business proceeds and other lawful income sources. The Customer may route agreed business proceeds through the designated payment arrangement where separately documented, but this Agreement shall not be interpreted as an unrestricted assignment of all of the Customer’s business income.'],
    },
    {
      number: 10,
      title: 'NO INTEREST',
      paragraphs: ['No interest shall be charged or recovered under this Agreement. If any law, judgment or instrument would otherwise imply interest, the Parties waive such interest to the extent lawfully permitted, without affecting the fixed Murabaha profit, charitable late-payment penalty or recovery of actual lawful costs expressly stated in this Agreement.'],
    },
    {
      number: 11,
      title: 'RECORDS, RECEIPTS AND DATA',
      paragraphs: [
        'The Company shall issue receipts or electronic confirmations for payments and maintain an account statement showing payments received, outstanding balance, penalties, costs and any sale proceeds.',
        'The Company may process the Customer’s identification, photograph, contact, payment, guarantor and transaction data only for administering this Agreement, compliance, fraud prevention and lawful recovery, subject to applicable Nigerian data-protection law.',
      ],
    },
    {
      number: 12,
      title: 'NOTICES AND AMENDMENTS',
      paragraphs: [
        'Notices may be delivered by hand, courier, registered post, verified email, SMS, WhatsApp or another agreed channel capable of being retained as evidence.',
        'No material amendment to the Cost Price, Contract Price, profit, tenor, instalment amount or security obligations shall be effective unless recorded in writing and signed or otherwise expressly accepted by both Parties. Administrative updates required by law or relating to contact details or payment channels may be notified by the Company.',
      ],
    },
    {
      number: 13,
      title: 'DISPUTE RESOLUTION AND GOVERNING LAW',
      paragraphs: [
        'The Parties shall first attempt to resolve any dispute through good-faith negotiation. If unresolved, the dispute shall be referred to mediation in Kano State and, if mediation fails, to arbitration by a sole arbitrator seated in Kano under the Arbitration and Mediation Act 2023.',
        'This Agreement shall be governed by the laws of the Federal Republic of Nigeria and interpreted, so far as lawfully possible, consistently with the principles of Islamic commercial jurisprudence. Mandatory Nigerian law shall prevail where any conflict arises.',
      ],
    },
    {
      number: 14,
      title: 'ENTIRE AGREEMENT AND SEVERABILITY',
      paragraphs: ['This Agreement, together with the asset invoices, payment schedule, guarantees and security documents, constitutes the entire agreement relating to the transaction. If any provision is invalid or unenforceable, the remaining provisions shall continue in force.'],
    },
  ];
}
