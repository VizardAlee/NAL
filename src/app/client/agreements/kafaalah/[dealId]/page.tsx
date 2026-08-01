'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileWarning, Loader2, Printer } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAgreementCurrency, formatAgreementDate } from '@/lib/agreements/mudaraba';
import { buildKafaalahClauses, type KafaalahBondModel } from '@/lib/agreements/kafaalah';
import { buildKafaalahBondPdf } from '@/lib/agreements/kafaalah-pdf';
import { loadClientKafaalahBondAction } from '../../actions';
import { AgreementCompanyStamp } from '@/components/agreement-company-stamp';
import { NonInterestInstitutionMark } from '@/components/non-interest-institution-mark';
import { AgreementSigningPanel } from '@/components/agreement-signing-panel';
import { AgreementElectronicSignature } from '@/components/agreement-electronic-signature';
import type { AgreementDocumentModel, AgreementSigningState } from '@/lib/agreements/signing';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(8.5rem,34%)_1fr] border-b border-slate-200 last:border-b-0"><div className="bg-[#075a3c] px-3 py-2 font-bold text-white">{label}</div><div className="bg-[#f6f1e2] px-3 py-2 text-slate-950">{children}</div></div>;
}

export default function ClientKafaalahBondPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const auth = useAuth();
  const [bond, setBond] = useState<KafaalahBondModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, startDownload] = useTransition();
  const [signingState, setSigningState] = useState<AgreementSigningState | null>(null);
  const useFrozenDocument = useCallback((model: AgreementDocumentModel) => setBond(model as KafaalahBondModel), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser || !dealId) return;
      const result = await loadClientKafaalahBondAction({ authToken: await auth.currentUser.getIdToken(), dealId });
      if (cancelled) return;
      if (result.success) setBond(result.bond); else setError(result.message);
      setLoading(false);
    }
    void load(); return () => { cancelled = true; };
  }, [auth, dealId]);

  const download = () => {
    if (!bond || bond.missingFields.length) return;
    startDownload(async () => {
      const bytes = await buildKafaalahBondPdf(bond, signingState);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${bond.bondId}-${bond.guarantor.name.replace(/\s+/g, '-')}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    });
  };

  if (loading) return <Skeleton className="mx-auto h-[80vh] max-w-4xl rounded-xl" />;
  if (error || !bond) return <Alert variant="destructive"><AlertTitle>Bond unavailable</AlertTitle><AlertDescription>{error || 'Bond not found.'}</AlertDescription></Alert>;
  const canExport = bond.missingFields.length === 0;
  return (
    <div className="agreement-screen mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden"><div><div className="flex items-center gap-2"><h1 className="font-semibold">Kafaalah Guarantee and Indemnity Bond</h1><Badge variant="outline">{bond.version}</Badge></div><p className="font-mono text-xs text-muted-foreground">{bond.bondId}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => window.print()} disabled={!canExport}><Printer className="mr-2 h-4 w-4" /> Print</Button><Button onClick={download} disabled={!canExport || downloading}>{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} {signingState?.status === 'EXECUTED' ? 'Download Executed PDF' : 'Download Draft PDF'}</Button></div></div>
      {!canExport && <Alert className="mb-5 print:hidden"><FileWarning className="h-4 w-4" /><AlertTitle>Bond details are incomplete</AlertTitle><AlertDescription>The administrator must complete: {bond.missingFields.join(', ')}.</AlertDescription></Alert>}
      <div className="mb-5"><AgreementSigningPanel agreementType="KAFAALAH" sourceId={dealId} disabled={!canExport} onStateChange={setSigningState} onFrozenDocument={useFrozenDocument} /></div>
      <article id="printable-agreement" className="agreement-paper bg-white px-8 py-7 text-[13px] leading-[1.55] text-slate-950 shadow-xl sm:px-14 sm:py-10">
        {signingState?.status !== 'EXECUTED' && <div className="mb-4 border-2 border-red-200 bg-red-50 py-2 text-center font-bold tracking-widest text-red-700">DRAFT — NOT YET FULLY EXECUTED</div>}
        <header className="mb-6 flex items-center gap-4 border-b-2 border-[#075a3c] pb-4"><img src="/NAL%20LOGO.jpg" alt="NAL logo" className="h-16 w-20 rounded object-cover" /><div><div className="font-serif text-lg font-bold text-[#075a3c]">{bond.company.name}</div><div className="max-w-xl text-[11px] text-slate-600">{bond.company.address}</div></div><NonInterestInstitutionMark className="ml-auto h-14 w-24" /></header>
        <h2 className="text-center font-serif text-2xl font-bold text-[#075a3c]">KAFAALAH BOND</h2><h3 className="mb-5 text-center font-serif font-bold">GUARANTEE AND INDEMNITY</h3>
        <div className="mb-7 overflow-hidden rounded border border-slate-200"><DetailRow label="Bond Reference">{bond.bondId}</DetailRow><DetailRow label="Principal Agreement">{bond.deal.name}</DetailRow><DetailRow label="Financing Mode">{bond.deal.financingMode}</DetailRow><DetailRow label="Contract Amount">{formatAgreementCurrency(bond.deal.principal)}</DetailRow><DetailRow label="Agreement Date">{formatAgreementDate(bond.principalAgreementDate)}</DetailRow></div>
        <div className="mb-4 flex items-start gap-4"><p className="flex-1 font-bold">THIS BOND OF KAFAALAH (GUARANTEE) is made this {formatAgreementDate(bond.bondDate)} by {bond.guarantor.name.toUpperCase()}, of {bond.guarantor.address} (hereinafter referred to as the “Guarantor” or “Kafeel”).</p>{bond.guarantor.photoURL && <img src={bond.guarantor.photoURL} alt={bond.guarantor.name} className="h-24 w-20 rounded border object-cover" />}</div>
        <h3 className="agreement-heading">WHEREAS</h3><p>The Guarantor has agreed to guarantee the obligations of <strong>{bond.client.name.toUpperCase()}</strong>, of {bond.client.address} (the “Customer”), under the substantive agreement dated {formatAgreementDate(bond.principalAgreementDate)} between the Customer and {bond.company.name} (the “Principal Agreement”).</p><p className="mb-5">The Guarantor agrees to secure the Customer’s performance of the terms and obligations contained in the Principal Agreement.</p><h3 className="agreement-heading">NOW THIS DEED WITNESSES AS FOLLOWS</h3>
        {buildKafaalahClauses(bond).map((clause) => <section key={clause.number} className="agreement-clause"><h3>{clause.number}. {clause.title}</h3><p>{clause.body}</p></section>)}
        <section className="agreement-clause"><h3>EXECUTION</h3><p>DATED this {formatAgreementDate(bond.bondDate)}.</p><p>IN WITNESS WHEREOF, the Guarantor has executed this Bond on the date stated above.</p><div className="mt-5 grid gap-8 sm:grid-cols-2"><div><strong>SIGNED BY THE GUARANTOR</strong><p className="mt-3">Name: {bond.guarantor.name.toUpperCase()}<br />Capacity: Guarantor / Kafeel<br />Phone: {bond.guarantor.phoneNumber}<br />Occupation: {bond.guarantor.occupation}</p><AgreementElectronicSignature signature={signingState?.signatures.GUARANTOR} /></div><div><strong>IN THE PRESENCE OF A WITNESS</strong><AgreementElectronicSignature signature={signingState?.signatures.WITNESS} /></div><div><strong>FOR NAL GENERAL MERCHANT LTD.</strong><AgreementElectronicSignature signature={signingState?.signatures.NAL_AUTHORIZED_SIGNATORY} /></div>{signingState?.status === 'EXECUTED' && <AgreementCompanyStamp />}</div></section>
        <p className="mt-6 text-xs italic">This Bond should be reviewed by a Nigerian legal practitioner and qualified Sharia adviser before execution.</p>
        <footer className="mt-8 border-t border-[#075a3c] pt-3 text-center text-[9px] text-slate-500">{bond.company.name} | RC No. {bond.company.rcNumber} | {bond.company.email} | {bond.company.website} | Tel: {bond.company.phoneNumbers}</footer>
      </article>
    </div>
  );
}
