export const KAFAALAH_BOND_VERSION = '1.0';

export type KafaalahBondModel = {
  type: 'KAFAALAH_GUARANTEE';
  version: string;
  bondId: string;
  dealId: string;
  bondDate: string;
  principalAgreementDate: string;
  company: { name: string; rcNumber: string; address: string; email: string; website: string; phoneNumbers: string };
  client: { id: string; name: string; address: string };
  guarantor: { name: string; address: string; phoneNumber: string; occupation: string; photoURL?: string };
  deal: { name: string; principal: number; profitRate: number; financingMode: 'Murabaha' | 'Ijara' | 'Mudaraba' };
  missingFields: string[];
};

export type BondClause = { number: number; title: string; body: string };

function returnObligation(mode: KafaalahBondModel['deal']['financingMode']): string {
  if (mode === 'Murabaha') return 'agreed Murabaha profit';
  if (mode === 'Ijara') return 'accrued and lawfully payable rental obligations';
  return 'contractually due profit-sharing obligations';
}

export function buildKafaalahClauses(model: KafaalahBondModel): BondClause[] {
  return [
    { number: 1, title: 'GUARANTEE OF THE CUSTOMER’S OBLIGATIONS', body: `The Guarantor shall guarantee the due performance by the Customer of all obligations under the Principal Agreement entered into between the Customer and ${model.company.name}.` },
    { number: 2, title: 'PAYMENT AND INDEMNITY', body: `Where the Customer breaches or defaults under the Principal Agreement, the Guarantor shall, upon written demand by ${model.company.name}, pay or indemnify the Company against any amount properly due and unpaid by the Customer, including the outstanding contract amount, ${returnObligation(model.deal.financingMode)}, applicable fees and charges, lawful default-related charges, reasonable recovery expenses and any other amount lawfully payable under the Principal Agreement.` },
    { number: 3, title: 'EXTENT OF LIABILITY', body: `The Guarantor’s liability under this Bond shall extend to the amount properly outstanding from the Customer under the Principal Agreement. A statement or certificate issued by an authorised officer of ${model.company.name} showing the amount outstanding shall constitute prima facie evidence of the amount due, subject to any manifest error or contrary evidence.` },
    { number: 4, title: 'SECURITY INSTRUMENTS', body: `The Guarantor shall provide such lawful security instruments as may reasonably be required by ${model.company.name}, including properly completed post-dated cheques, payment mandates or other approved security documents. Every cheque or security instrument shall state the relevant amount, purpose and transaction details and shall be used only in accordance with the Principal Agreement and applicable Nigerian law.` },
    { number: 5, title: 'CONTINUING GUARANTEE', body: `This Bond shall constitute a continuing guarantee and shall remain valid until all obligations of the Customer under the Principal Agreement have been fully paid, discharged or otherwise settled to the satisfaction of ${model.company.name}. The Guarantor shall not be released merely because the Company grants the Customer additional time, agrees to a repayment arrangement, delays enforcement or exercises any other lawful discretion, provided that the Guarantor’s liability shall not be increased beyond the obligations covered by the Principal Agreement without the Guarantor’s written consent.` },
    { number: 6, title: 'PARTIES AND SUCCESSORS', body: `References to ${model.company.name}, the Customer and the Guarantor shall, where the context permits, include their respective permitted successors, assigns, personal representatives, executors and administrators. The expression “security” includes any lawful guarantee, indemnity, lien, charge, payment mandate, negotiable instrument, judgment or other security document issued in connection with the Principal Agreement.` },
    { number: 7, title: 'POSTPONEMENT OF THE GUARANTOR’S CLAIMS', body: `Until all obligations owed by the Customer to ${model.company.name} have been fully discharged, the Guarantor shall not claim repayment from the Customer for any amount paid under this Bond, exercise any set-off or counterclaim in competition with the Company, claim the benefit of any security held by the Company, or take any step that may prejudice the Company’s recovery rights. After the Company has been fully paid, the Guarantor may exercise any lawful right of recovery against the Customer.` },
    { number: 8, title: 'CONTINUING EFFECT', body: 'This Bond shall remain valid and enforceable until the secured obligations have been fully discharged, notwithstanding any lawful delay, extension, indulgence, settlement arrangement or failure by the Company to immediately enforce any right.' },
    { number: 9, title: 'EVENTS NOT RELEASING THE GUARANTOR', body: 'The Guarantor shall not be released from liability solely by reason of the death, incapacity, bankruptcy, insolvency or liquidation of the Customer; a lawful amendment, extension, rescheduling, novation or restatement of the Principal Agreement; the Company’s failure or delay in enforcing any security; the release, replacement or variation of another security; or any other lawful indulgence granted to the Customer. However, no material amendment that substantially increases the Guarantor’s financial liability shall bind the Guarantor without the Guarantor’s prior written consent.' },
    { number: 10, title: 'INDEPENDENT INDEMNITY', body: `Where any obligation of the Customer is found to be invalid or unenforceable because of a technical defect, lack of authority or procedural irregularity, the Guarantor shall remain liable as an indemnifier only to the extent that the Company lawfully provided value or incurred loss in reliance on the transaction and the relevant liability is not prohibited by mandatory Nigerian law. The Guarantor shall indemnify ${model.company.name} against proven loss, damage, cost and reasonable recovery expenses arising from the Customer’s failure to discharge the secured obligations.` },
    { number: 11, title: 'GOVERNING LAW', body: 'This Bond shall be governed by the laws of the Federal Republic of Nigeria and interpreted, so far as legally permissible, in accordance with the applicable principles of Islamic Commercial Jurisprudence. The courts and tribunals of Nigeria shall have jurisdiction over matters arising from this Bond.' },
    { number: 12, title: 'ACKNOWLEDGEMENT BY THE GUARANTOR', body: 'The Guarantor acknowledges that the Guarantor has read and understood this Bond; is aware of the nature and extent of the obligations guaranteed; has executed it voluntarily and without coercion or duress; has had the opportunity to obtain independent legal and financial advice; and, where such advice has not been obtained, has voluntarily chosen to proceed without it.' },
  ];
}
