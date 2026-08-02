import { addDays, addMonths, addWeeks, addYears, format, subDays } from 'date-fns';

export const MUDARABA_AGREEMENT_VERSION = 'NAL-MUDARABA-2026-02';

export type AgreementAccount = {
  accountName: string;
  accountNumber: string;
  bankName: string;
};

export type MudarabaAgreementModel = {
  type: 'MUDARABA_INVESTMENT';
  version: string;
  agreementId: string;
  batchId: string;
  agreementDate: string;
  paymentDate: string;
  paymentReference: string;
  amount: number;
  amountInWords: string;
  tenureValue: number;
  tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  termLabel: string;
  maturityDate: string;
  investor: {
    id: string;
    name: string;
    address: string;
    email: string;
    phoneNumber: string;
    photoURL?: string;
    isMuslim?: boolean;
    account: AgreementAccount;
  };
  company: {
    name: string;
    rcNumber: string;
    address: string;
    email: string;
    website: string;
    phoneNumbers: string;
    account: AgreementAccount;
  };
  missingFields: string[];
};

export type AgreementClause = {
  number: number;
  title: string;
  body: string;
};

const SMALL_NUMBERS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function integerToWords(value: number): string {
  const integer = Math.floor(Math.abs(value));
  if (integer < 20) return SMALL_NUMBERS[integer];
  if (integer < 100) {
    const remainder = integer % 10;
    return `${TENS[Math.floor(integer / 10)]}${remainder ? `-${SMALL_NUMBERS[remainder]}` : ''}`;
  }
  if (integer < 1_000) {
    const remainder = integer % 100;
    return `${SMALL_NUMBERS[Math.floor(integer / 100)]} Hundred${remainder ? ` and ${integerToWords(remainder)}` : ''}`;
  }

  const scales: Array<[number, string]> = [
    [1_000_000_000_000, 'Trillion'],
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ];
  for (const [scale, label] of scales) {
    if (integer >= scale) {
      const quotient = Math.floor(integer / scale);
      const remainder = integer % scale;
      const joiner = remainder > 0 && remainder < 100 ? ' and ' : ' ';
      return `${integerToWords(quotient)} ${label}${remainder ? `${joiner}${integerToWords(remainder)}` : ''}`;
    }
  }
  return String(integer);
}

export function nairaAmountInWords(amount: number): string {
  const roundedKobo = Math.round(Math.abs(amount) * 100);
  const naira = Math.floor(roundedKobo / 100);
  const kobo = roundedKobo % 100;
  const nairaLabel = `${integerToWords(naira)} Naira`;
  return kobo > 0
    ? `${nairaLabel} and ${integerToWords(kobo)} Kobo Only`
    : `${nairaLabel} Only`;
}

export function calculateMaturityDate(
  startsAt: Date,
  tenureValue: number,
  tenureUnit: MudarabaAgreementModel['tenureUnit']
): Date {
  let exclusiveEnd: Date;
  switch (tenureUnit) {
    case 'Days':
      exclusiveEnd = addDays(startsAt, tenureValue);
      break;
    case 'Weeks':
      exclusiveEnd = addWeeks(startsAt, tenureValue);
      break;
    case 'Fortnights':
      exclusiveEnd = addDays(startsAt, tenureValue * 14);
      break;
    case 'Months':
      exclusiveEnd = addMonths(startsAt, tenureValue);
      break;
    case 'Years':
      exclusiveEnd = addYears(startsAt, tenureValue);
      break;
  }
  return subDays(exclusiveEnd, 1);
}

export function formatAgreementDate(value: string | Date): string {
  return format(typeof value === 'string' ? new Date(value) : value, 'd MMMM yyyy');
}

export function formatAgreementCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatAgreementTerm(
  value: number,
  unit: MudarabaAgreementModel['tenureUnit']
): string {
  const singular = unit.endsWith('s') ? unit.slice(0, -1) : unit;
  return `${value} calendar ${value === 1 ? singular.toLowerCase() : unit.toLowerCase()}`;
}

export function buildMudarabaClauses(model: MudarabaAgreementModel): AgreementClause[] {
  const agreementDate = formatAgreementDate(model.agreementDate);
  const maturityDate = formatAgreementDate(model.maturityDate);
  const capital = formatAgreementCurrency(model.amount);
  const zakatText = model.investor.isMuslim === false
    ? 'The Investor is recorded as non-Muslim, and no Zakat shall be deducted from this Investment. If that status changes, the Investor shall notify the Company before the next annual assessment.'
    : 'Each Investment Year shall be measured using the Gregorian calendar. For a Muslim Investor, the Company shall calculate and deduct Zakat at the end of each completed Investment Year in accordance with its adopted Sharia methodology. The Company shall select the eligible beneficiary, beneficiaries or approved charitable channel and keep a record of the calculation, amount deducted, distribution date and beneficiary category or channel. No Zakat shall be deducted from a non-Muslim Investor.';

  return [
    {
      number: 1,
      title: 'INVESTMENT CAPITAL',
      body: `The Investor shall provide ${capital} (${model.amountInWords}). The Company shall issue a receipt and maintain a separate identifiable ledger for the capital, transactions, profit, loss, Zakat, taxes and withdrawals. The capital does not confer shares or voting rights in the Company.`,
    },
    {
      number: 2,
      title: 'DURATION',
      body: `The Investment shall run for ${model.termLabel} from ${agreementDate} and shall mature at the close of business on ${maturityDate}. Where the maturity date falls on a Saturday, Sunday or public holiday in Nigeria, any payment, settlement, notice or other action due on that date shall be completed on the next Business Day without extending the agreed Investment term. Where any part of the Investment Capital or proceeds remains tied to an outstanding transaction, debt-recovery process, asset disposal or final reconciliation at maturity, the Company may complete settlement within a maximum of thirty (30) Business Days, counted from the next Business Day following the maturity date. The Company shall notify the Investor through an approved digital or manual channel of the reason for the delay and the expected settlement date. For this Agreement, “Business Day” means any day other than a Saturday, Sunday or public holiday officially recognised in the Federal Republic of Nigeria.`,
    },
    {
      number: 3,
      title: 'PERMITTED ACTIVITIES',
      body: 'The Company shall deploy the capital only in lawful and Sharia-compliant activities, including Murabaha, Mudaraba, Salam, Istisna, Ijara, Musharaka and other lawful trade or joint-venture transactions. The capital shall not be used for unlawful activity, personal expenditure, prohibited interest-bearing transactions or undisclosed related-party dealings.',
    },
    {
      number: 4,
      title: 'MANAGEMENT AND RECORDS',
      body: 'The Company shall manage the investment with reasonable skill, care, diligence and accountability; keep proper books and supporting records; avoid unauthorised use of funds; and disclose material conflicts of interest or events that may adversely affect the investment.',
    },
    {
      number: 5,
      title: 'PROFIT AND LOSS',
      body: 'Actual realised net profit shall be shared forty per cent (40%) to the Investor and sixty per cent (60%) to the Company. No fixed or guaranteed return is promised. Genuine commercial loss shall be borne by the Investor to the extent permitted by law and the agreed Sharia framework, except where the loss arises from the Company’s fraud, negligence, wilful misconduct, breach or unauthorised use of funds.',
    },
    {
      number: 6,
      title: 'REPORTS AND INVESTOR ACCESS',
      body: 'The Company may provide periodic reports as it considers appropriate and shall provide an annual statement showing capital deployed, realised profit or loss, Zakat, withholding tax, withdrawals and closing balance. The Investor may inspect records reasonably related to the investment on prior written notice. Information may be accessed through the Company’s app, website, office, printed statements, verified email or other approved channel.',
    },
    {
      number: 7,
      title: 'DIGITAL AND MANUAL SERVICES',
      body: 'The Investor may submit investment applications, withdrawal requests, complaints, account updates and other instructions through the authenticated app or an approved manual channel. Properly submitted digital and manual requests shall have equal validity. Digital requests shall carry a timestamp and reference number; manual requests shall receive a dated and numbered acknowledgement. The use or non-use of the app shall not reduce the Investor’s rights.',
    },
    {
      number: 8,
      title: 'SECURITY AND AUTHENTICATION',
      body: 'The Investor shall protect passwords, PINs, OTPs and other credentials and promptly report suspected compromise. The Company may require additional verification for withdrawals, bank-detail changes, new investments or other sensitive transactions. Staff assisting an Investor shall not request or handle the Investor’s password, PIN or OTP.',
    },
    { number: 9, title: 'ZAKAT', body: zakatText },
    {
      number: 10,
      title: 'ANNUAL PROFIT WITHDRAWAL',
      body: 'Where this particular fund batch is locked for more than two (2) years, the Investor shall have five (5) calendar days from each completed anniversary date to request withdrawal of up to twenty per cent (20%) of the Investor’s allocated realised net profit for that completed year. The request may be made through the app or an approved manual channel. The right applies only to profit after applicable Zakat and statutory deductions and not to the investment capital. The reserved twenty per cent (20%) shall not be reinvestible during the five-day window. Approved withdrawals shall be paid within ten (10) Business Days after the window closes.',
    },
    {
      number: 11,
      title: 'TAX AND WITHHOLDING TAX',
      body: 'Where required by Nigerian law, the Company may deduct withholding tax or any other statutory amount from a taxable payment before remitting the net amount to the Investor. The Company shall remit the deduction to the appropriate authority and provide the relevant credit note, receipt or other evidence when available. Such deductions shall not be charged against the investment capital.',
    },
    {
      number: 12,
      title: 'EARLY TERMINATION',
      body: `The Investment Capital shall remain committed until the maturity date of ${maturityDate}, and the Investor shall not be entitled to terminate the Investment or demand the return of the Investment Capital before that date. The annual profit-withdrawal right under Clause 10 applies only to the permitted portion of realised profit and shall not constitute early termination or capital withdrawal. The Company may terminate the Agreement before maturity where it reasonably determines that continuation has become hazardous, materially risky, unlawful, commercially impracticable, materially unprofitable or otherwise prejudicial to the safety, viability or legitimate interests of the business. Where reasonably practicable, the Company shall notify the Investor, prepare a final account and settle any amount properly due after accounting for realised profit or loss, liabilities, Zakat and statutory deductions. Nothing in this Clause shall prevent compliance with a binding order of a court or competent authority or any mandatory provision of Nigerian law.`,
    },
    {
      number: 13,
      title: 'CONFIDENTIALITY AND DATA PROTECTION',
      body: 'Each Party shall keep confidential all financial, commercial, operational and personal information obtained under this Agreement, except where disclosure is required by law or reasonably made to advisers, auditors, bankers, regulators or courts. Personal data collected through the app, paper forms, office visits or other approved channels shall be processed securely and only for lawful purposes connected with the investment.',
    },
    {
      number: 14,
      title: 'REGULATORY COMPLIANCE',
      body: 'This Agreement is intended as a private bilateral Mudaraba arrangement and not a public offer. The Company shall obtain any licence, approval, registration or filing required by Nigerian law. Where funds are pooled from multiple investors or investments are marketed to the public, the Company shall comply with applicable Securities and Exchange Commission requirements and other relevant laws.',
    },
    {
      number: 15,
      title: 'NOTICES, DISPUTES AND GOVERNING LAW',
      body: 'Notices may be delivered through the app, verified email, hand delivery, courier, registered post or another approved channel. The Parties shall first attempt to resolve disputes by good-faith negotiation, then mediation in Kano State, and, if unresolved, arbitration by a sole arbitrator in Kano under the Arbitration and Mediation Act 2023. This Agreement shall be governed by the laws of the Federal Republic of Nigeria.',
    },
    {
      number: 16,
      title: 'ENTIRE AGREEMENT AND AMENDMENTS',
      body: 'This Agreement constitutes the entire agreement concerning the Investment. The Company may amend or update this Agreement where reasonably necessary for legal, regulatory, Sharia, tax, Zakat, security, risk-management, administrative, operational or other legitimate business purposes. The Company shall notify the Investor through an approved digital or manual channel before the amendment takes effect, except where immediate implementation is required by law, a competent authority or an urgent security or risk event. An amendment shall not retrospectively reduce realised profit already allocated to the Investor, invalidate a completed approved withdrawal, require additional Investment Capital, extend the maturity date or exclude liability for fraud, negligence, wilful misconduct or unlawful use of funds. The Company shall retain the applicable versions of the Agreement and make them available through the app or an approved manual channel.',
    },
  ];
}
