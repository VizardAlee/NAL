'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Download, FileWarning, Loader2, Printer, Settings } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AgreementCompanyStamp } from '@/components/agreement-company-stamp';
import { AgreementElectronicSignature } from '@/components/agreement-electronic-signature';
import { AgreementSigningPanel } from '@/components/agreement-signing-panel';
import { NonInterestInstitutionMark } from '@/components/non-interest-institution-mark';
import { formatAgreementCurrency, formatAgreementDate } from '@/lib/agreements/mudaraba';
import { buildMurabahaAgreementPdf } from '@/lib/agreements/murabaha-pdf';
import { buildMurabahaClauses, type MurabahaAgreementModel } from '@/lib/agreements/murabaha';
import type { AgreementDocumentModel, AgreementSigningState } from '@/lib/agreements/signing';
import { loadClientMurabahaAgreementAction } from '../../actions';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(9rem,34%)_1fr] border-b border-slate-200 last:border-b-0"><div className="bg-[#075a3c] px-3 py-2 font-bold text-white">{label}</div><div className="bg-[#f6f1e2] px-3 py-2 text-slate-950">{children}</div></div>;
}

export default function ClientMurabahaAgreementPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const auth = useAuth();
  const [agreement, setAgreement] = useState<MurabahaAgreementModel | null>(null);
  const [signingState, setSigningState] = useState<AgreementSigningState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, startDownload] = useTransition();
  const useFrozenDocument = useCallback((model: AgreementDocumentModel) => setAgreement(model as MurabahaAgreementModel), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser || !dealId) return;
      const result = await loadClientMurabahaAgreementAction({ authToken: await auth.currentUser.getIdToken(), dealId });
      if (cancelled) return;
      if (result.success) setAgreement(result.agreement); else setError(result.message);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [auth, dealId]);

  const downloadPdf = () => {
    if (!agreement || agreement.missingFields.length) return;
    startDownload(async () => {
      const bytes = await buildMurabahaAgreementPdf(agreement, signingState);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${agreement.agreementId}-${agreement.client.name.replace(/\s+/g, '-')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  if (loading) return <Skeleton className="mx-auto h-[80vh] max-w-4xl rounded-xl" />;
  if (error || !agreement) return <Alert variant="destructive"><AlertTitle>Agreement unavailable</AlertTitle><AlertDescription>{error || 'Agreement not found.'}</AlertDescription></Alert>;
  const canExport = agreement.missingFields.length === 0;
  const installmentLabel = agreement.deal.installmentMinimum === agreement.deal.installmentMaximum
    ? formatAgreementCurrency(agreement.deal.installmentMaximum)
    : `${formatAgreementCurrency(agreement.deal.installmentMinimum)} – ${formatAgreementCurrency(agreement.deal.installmentMaximum)}`;

  return <div className="agreement-screen mx-auto max-w-5xl">
    <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden"><div><div className="flex items-center gap-2"><h1 className="font-semibold">Murabaha Sales Contract</h1><Badge variant="outline">{agreement.version}</Badge></div><p className="font-mono text-xs text-muted-foreground">{agreement.agreementId}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => window.print()} disabled={!canExport}><Printer className="mr-2 h-4 w-4" /> Print</Button><Button onClick={downloadPdf} disabled={!canExport || downloading}>{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} {signingState?.status === 'EXECUTED' ? 'Download Executed PDF' : 'Download Draft PDF'}</Button></div></div>
    {!canExport && <Alert className="mb-5 print:hidden"><FileWarning className="h-4 w-4" /><AlertTitle>Complete the agreement details</AlertTitle><AlertDescription className="space-y-3"><p>Before signing, printing or downloading, complete: {agreement.missingFields.join(', ')}.</p><Button asChild size="sm" variant="outline"><Link href="/client/settings"><Settings className="mr-2 h-4 w-4" /> Open Client Settings</Link></Button></AlertDescription></Alert>}
    <div className="mb-5"><AgreementSigningPanel agreementType="MURABAHA" sourceId={dealId} primaryRole="CLIENT" disabled={!canExport} onStateChange={setSigningState} onFrozenDocument={useFrozenDocument} /></div>

    <article id="printable-agreement" className="agreement-paper bg-white px-8 py-7 text-[13px] leading-[1.55] text-slate-950 shadow-xl sm:px-14 sm:py-10">
      {signingState?.status !== 'EXECUTED' && <div className="mb-4 border-2 border-red-200 bg-red-50 py-2 text-center font-bold tracking-widest text-red-700">DRAFT — NOT YET FULLY EXECUTED</div>}
      <header className="mb-6 flex items-center gap-4 border-b-2 border-[#075a3c] pb-4"><img src="/NAL%20LOGO.jpg" alt="NAL logo" className="h-16 w-20 rounded object-cover" /><div><div className="font-serif text-lg font-bold text-[#075a3c]">{agreement.company.name}</div><div className="max-w-xl text-[11px] text-slate-600">{agreement.company.address}</div></div><NonInterestInstitutionMark className="ml-auto h-14 w-24" /></header>
      <h2 className="mb-1 text-center font-serif text-2xl font-bold text-[#075a3c]">MURABAHA SALES CONTRACT AGREEMENT</h2><p className="mb-6 text-center text-xs">Effective Date: {formatAgreementDate(agreement.agreementDate)}</p>
      <div className="mb-7 overflow-hidden rounded border border-slate-200"><DetailRow label="Reference">{agreement.agreementId}</DetailRow><DetailRow label="Customer">{agreement.client.name}</DetailRow><DetailRow label="Approved Assets">{agreement.deal.assetDescription}</DetailRow><DetailRow label="Cost Price">{formatAgreementCurrency(agreement.deal.costPrice)}</DetailRow><DetailRow label="Murabaha Profit">{formatAgreementCurrency(agreement.deal.profit)} ({agreement.deal.profitRate}% of Cost Price)</DetailRow><DetailRow label="Contract Price">{formatAgreementCurrency(agreement.deal.contractPrice)}</DetailRow><DetailRow label="Tenor">{agreement.deal.durationValue} {agreement.deal.durationUnit}</DetailRow><DetailRow label="Instalments">{installmentLabel} × {agreement.deal.installmentCount} {agreement.deal.repaymentFrequency.toLowerCase()} repayments</DetailRow><DetailRow label="Management Fee">{formatAgreementCurrency(agreement.deal.managementFeeAmount)} ({agreement.deal.managementFeeRate}% of Cost Price; separate from Contract Price)</DetailRow></div>
      <p className="mb-4 font-bold">THIS MURABAHA SALES CONTRACT AGREEMENT (the “Agreement”) is made on {formatAgreementDate(agreement.agreementDate)} between:</p>
      <h3 className="agreement-heading">PARTIES</h3><p className="mb-3"><strong>{agreement.company.name}</strong>, RC No. {agreement.company.rcNumber}, of {agreement.company.address} (the “Company” or “Seller”); and</p><div className="mb-3 flex items-start gap-4"><p className="flex-1"><strong>{agreement.client.name.toUpperCase()}</strong>, of {agreement.client.address} (the “Customer” or “Buyer”).</p>{agreement.client.photoURL && <img src={agreement.client.photoURL} alt={agreement.client.name} className="h-24 w-20 rounded border object-cover" />}</div><p className="mb-4">The Company and the Customer are collectively referred to as the “Parties”.</p>
      <h3 className="agreement-heading">RECITALS</h3><p className="mb-2">A. The Customer requested the Company to purchase the approved assets and resell them on a disclosed cost-plus-profit basis.</p><p className="mb-2">B. The Customer agreed to purchase the assets at the Contract Price and pay by the attached schedule.</p><p className="mb-5">C. The Parties intend the transaction to comply with Nigerian law and the principles of Islamic commercial jurisprudence.</p><p className="mb-4 font-bold">NOW IT IS AGREED AS FOLLOWS:</p>
      {buildMurabahaClauses(agreement).map((clause) => <section key={clause.number} className="agreement-clause"><h3>{clause.number}. {clause.title}</h3>{clause.paragraphs.map((paragraph, index) => <p className="mb-2" key={index}>{paragraph}</p>)}</section>)}
      <section className="agreement-clause"><h3>EXECUTION</h3><p>IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.</p><div className="mt-5 grid gap-8 sm:grid-cols-2"><div><strong>FOR AND ON BEHALF OF NAL GENERAL MERCHANT LTD</strong><AgreementElectronicSignature signature={signingState?.signatures.NAL_SIGNATORY_1} /><AgreementElectronicSignature signature={signingState?.signatures.NAL_SIGNATORY_2} />{signingState?.status === 'EXECUTED' && <AgreementCompanyStamp className="mt-4" />}</div><div><strong>SIGNED BY THE CUSTOMER</strong><p className="mt-3">Name: {agreement.client.name.toUpperCase()}<br />Address: {agreement.client.address}</p><AgreementElectronicSignature signature={signingState?.signatures.CLIENT} /></div></div></section>
      <section className="agreement-clause"><h3>IN THE PRESENCE OF A WITNESS</h3><AgreementElectronicSignature signature={signingState?.signatures.WITNESS} /></section>
      <section className="agreement-clause"><h3>GUARANTOR DETAILS</h3><p>Name: {agreement.guarantor.name}<br />Address: {agreement.guarantor.address}<br />Phone: {agreement.guarantor.phoneNumber}<br />Occupation: {agreement.guarantor.occupation || 'Not recorded'}</p><AgreementElectronicSignature signature={signingState?.signatures.GUARANTOR} /></section>
      <section className="agreement-clause break-before-page"><h3>ATTACHMENT A — DATED REPAYMENT SCHEDULE</h3><p className="mb-4">This complete schedule forms part of the Murabaha Sales Contract.</p><div className="overflow-hidden"><table className="deal-print-table w-full table-fixed border-collapse text-[8px]"><thead><tr><th className="w-[5%]">SN</th><th className="w-[12%]">Due Date</th><th>Opening Balance</th><th>Profit</th><th>Principal</th><th>Instalment</th><th>Closing Balance</th></tr></thead><tbody>{agreement.deal.schedule.map((row) => <tr key={row.installment}><td>{row.installment}</td><td>{new Date(row.dueDate).toLocaleDateString('en-GB')}</td><td>{formatAgreementCurrency(row.openingBalance)}</td><td>{formatAgreementCurrency(row.profit)}</td><td>{formatAgreementCurrency(row.principal)}</td><td>{formatAgreementCurrency(row.payment)}</td><td>{formatAgreementCurrency(row.closingBalance)}</td></tr>)}</tbody></table></div></section>
      <p className="mt-6 text-xs italic">The asset invoices and all guarantee or security documents shall be attached before final execution.</p><footer className="mt-8 border-t border-[#075a3c] pt-3 text-center text-[9px] text-slate-500">{agreement.company.name} | RC No. {agreement.company.rcNumber} | {agreement.company.email} | {agreement.company.website} | Tel: {agreement.company.phoneNumbers}</footer>
    </article>
  </div>;
}
