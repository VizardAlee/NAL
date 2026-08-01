export const WAKALAH_AGREEMENT_VERSION = '1.0';

export type WakalahAgreementModel = {
  type: 'WAKALAH_PROCUREMENT';
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
  company: {
    name: string;
    rcNumber: string;
    address: string;
    email: string;
    website: string;
    phoneNumbers: string;
  };
  deal: {
    name: string;
    assetDescription: string;
    supplierName: string;
    principal: number;
    financingMode: 'Murabaha';
  };
  missingFields: string[];
};

export type AgreementClause = { number: number; title: string; body: string };

export function buildWakalahClauses(model: WakalahAgreementModel): AgreementClause[] {
  const asset = model.deal.assetDescription;
  const supplier = model.deal.supplierName;
  return [
    {
      number: 1,
      title: 'USE OF PROCUREMENT FUNDS',
      body: `The Customer, acting solely as the Company’s procurement agent, shall use the funds provided by the Company exclusively to purchase ${asset} from ${supplier}. The Customer shall not treat the funds as a personal loan, advance or financing made available for any purpose other than the approved purchase.`,
    },
    {
      number: 2,
      title: 'OWNERSHIP OF THE ASSET',
      body: 'Title, ownership and all proprietary rights in the asset shall vest in the Company immediately upon purchase from the supplier. The Customer shall hold the asset in trust and in actual or constructive possession on behalf of the Company pending completion of the Murabaha sale.',
    },
    {
      number: 3,
      title: 'PURCHASE DOCUMENTS',
      body: 'The Customer shall obtain and provide the Company with all available purchase documents, including invoices, receipts, delivery notes, warranty documents and any other evidence confirming that the asset was acquired for and in the name of the Company.',
    },
    {
      number: 4,
      title: 'COMPLETION OF THE MURABAHA SALE',
      body: 'Following confirmation that the Company has acquired ownership and actual or constructive possession of the asset, the Company shall sell the asset to the Customer at the agreed Murabaha price and on the agreed deferred-payment terms.',
    },
    {
      number: 5,
      title: 'LIMITATION OF THE AGENCY',
      body: 'The agency created under this Agreement is limited strictly to the procurement of the approved asset. It shall not be construed as a cash-financing arrangement, an interest-bearing loan, a revolving credit facility or an unrestricted authority to act on behalf of the Company.',
    },
    {
      number: 6,
      title: 'COMPLIANCE WITH ISLAMIC COMMERCIAL PRINCIPLES',
      body: 'The Parties acknowledge that this arrangement is intended to comply with the principles of Islamic commercial jurisprudence, including the prohibition of Riba. This Agreement shall therefore be interpreted in accordance with those principles, subject to applicable Nigerian law.',
    },
  ];
}
