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
import { loadInvestorAgreementAction } from '../actions';
import {
  buildMudarabaClauses,
  formatAgreementCurrency,
  formatAgreementDate,
  type MudarabaAgreementModel,
} from '@/lib/agreements/mudaraba';
import { buildMudarabaAgreementPdf } from '@/lib/agreements/mudaraba-pdf';
import { AgreementCompanyStamp } from '@/components/agreement-company-stamp';
import { NonInterestInstitutionMark } from '@/components/non-interest-institution-mark';
import { AgreementSigningPanel } from '@/components/agreement-signing-panel';
import { AgreementElectronicSignature } from '@/components/agreement-electronic-signature';
import type { AgreementDocumentModel, AgreementSigningState } from '@/lib/agreements/signing';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8.5rem,34%)_1fr] border-b border-slate-200 last:border-b-0">
      <div className="bg-[#075a3c] px-3 py-2 font-bold text-white">{label}</div>
      <div className="bg-[#f6f1e2] px-3 py-2 text-slate-950">{children}</div>
    </div>
  );
}

export default function InvestorAgreementPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const auth = useAuth();
  const [agreement, setAgreement] = useState<MudarabaAgreementModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, startDownload] = useTransition();
  const [signingState, setSigningState] = useState<AgreementSigningState | null>(null);
  const useFrozenDocument = useCallback((model: AgreementDocumentModel) => setAgreement(model as MudarabaAgreementModel), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser || !batchId) return;
      const result = await loadInvestorAgreementAction({
        authToken: await auth.currentUser.getIdToken(),
        batchId,
      });
      if (cancelled) return;
      if (result.success) setAgreement(result.agreement);
      else setError(result.message);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [auth, batchId]);

  const downloadPdf = () => {
    if (!agreement || agreement.missingFields.length) return;
    startDownload(async () => {
      const bytes = await buildMudarabaAgreementPdf(agreement, signingState);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${agreement.agreementId}-${agreement.investor.name.replace(/\s+/g, '-')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  if (loading) return <Skeleton className="mx-auto h-[80vh] max-w-4xl rounded-xl" />;
  if (error || !agreement) return <Alert variant="destructive"><AlertTitle>Agreement unavailable</AlertTitle><AlertDescription>{error || 'Agreement not found.'}</AlertDescription></Alert>;

  const clauses = buildMudarabaClauses(agreement);
  const canExport = agreement.missingFields.length === 0;

  return (
    <div className="agreement-screen mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2"><h1 className="font-semibold">Mudaraba Investment Agreement</h1><Badge variant="outline">{agreement.version}</Badge></div>
          <p className="font-mono text-xs text-muted-foreground">{agreement.agreementId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canExport}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button onClick={downloadPdf} disabled={!canExport || downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} {signingState?.status === 'EXECUTED' ? 'Download Executed PDF' : 'Download Draft PDF'}
          </Button>
        </div>
      </div>

      {!canExport && (
        <Alert className="mb-5 print:hidden">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>Complete your agreement details</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Before printing or downloading, add: {agreement.missingFields.join(', ')}.</p>
            <Button asChild size="sm" variant="outline"><Link href="/investor/settings"><Settings className="mr-2 h-4 w-4" /> Open Settings</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-5"><AgreementSigningPanel agreementType="MUDARABA" sourceId={batchId} primaryRole="INVESTOR" disabled={!canExport} onStateChange={setSigningState} onFrozenDocument={useFrozenDocument} /></div>

      <article id="printable-agreement" className="agreement-paper bg-white px-8 py-7 text-[13px] leading-[1.55] text-slate-950 shadow-xl sm:px-14 sm:py-10">
        {signingState?.status !== 'EXECUTED' && <div className="mb-4 border-2 border-red-200 bg-red-50 py-2 text-center font-bold tracking-widest text-red-700">DRAFT — NOT YET FULLY EXECUTED</div>}
        <header className="mb-6 flex items-center gap-4 border-b-2 border-[#075a3c] pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/NAL%20LOGO.jpg" alt="NAL logo" className="h-16 w-20 rounded object-cover" />
          <div>
            <div className="font-serif text-lg font-bold text-[#075a3c]">{agreement.company.name}</div>
            <div className="max-w-xl text-[11px] text-slate-600">{agreement.company.address}</div>
          </div>
          <NonInterestInstitutionMark className="ml-auto h-14 w-24" />
        </header>

        <h2 className="mb-5 text-center font-serif text-2xl font-bold text-[#075a3c]">MUDARABA INVESTMENT AGREEMENT</h2>
        <div className="mb-7 overflow-hidden rounded border border-slate-200">
          <DetailRow label="Agreement Date">{formatAgreementDate(agreement.agreementDate)}</DetailRow>
          <DetailRow label="Investment Capital">{formatAgreementCurrency(agreement.amount)}</DetailRow>
          <DetailRow label="Term">{agreement.termLabel}</DetailRow>
          <DetailRow label="Maturity">Close of business on {formatAgreementDate(agreement.maturityDate)}</DetailRow>
        </div>

        <p className="mb-4 font-bold">THIS MUDARABA INVESTMENT AGREEMENT is made on {formatAgreementDate(agreement.agreementDate)}.</p>
        <h3 className="agreement-heading">BETWEEN</h3>
        <p><strong>{agreement.company.name}</strong>, RC No. {agreement.company.rcNumber}, of {agreement.company.address} (the “Company” or “Mudarib”);</p>
        <h3 className="agreement-heading">AND</h3>
        <div className="mb-4 flex items-start gap-4">
          <p className="flex-1"><strong>{agreement.investor.name.toUpperCase()}</strong>, of {agreement.investor.address} (the “Investor” or “Rabb al-Mal”).</p>
          {agreement.investor.photoURL && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agreement.investor.photoURL} alt={agreement.investor.name} className="h-24 w-20 rounded border object-cover" />
          )}
        </div>
        <h3 className="agreement-heading">RECITAL</h3>
        <p className="mb-5">The Investor has agreed to provide capital to the Company for lawful, commercially reasonable and Sharia-compliant business activities, and the Company has agreed to manage the investment on the terms set out below.</p>

        {clauses.map((clause) => (
          <section key={clause.number} className="agreement-clause">
            <h3>{clause.number}. {clause.title}</h3>
            <p>{clause.body}</p>
          </section>
        ))}

        <section className="agreement-clause">
          <h3>EXECUTION</h3>
          <p>IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first above written.</p>
          <div className="mt-5 grid gap-8 sm:grid-cols-2">
            <div><strong>FOR NAL GENERAL MERCHANT LTD.</strong><AgreementElectronicSignature signature={signingState?.signatures.NAL_SIGNATORY_1} /></div>
            <div><strong>FOR NAL GENERAL MERCHANT LTD.</strong><AgreementElectronicSignature signature={signingState?.signatures.NAL_SIGNATORY_2} /></div>
            {signingState?.status === 'EXECUTED' && <AgreementCompanyStamp />}
            <div className="relative"><strong>SIGNED BY THE INVESTOR</strong><p className="mt-3">Name: {agreement.investor.name.toUpperCase()}<br />Capacity: Investor / Rabb al-Mal</p><AgreementElectronicSignature signature={signingState?.signatures.INVESTOR} /></div>
          </div>
        </section>

        <section className="agreement-clause">
          <h3>WITNESSES</h3>
          <div className="grid gap-8 sm:grid-cols-2">
            {[1, 2].map((number) => <p key={number}>Witness {number}<br />Name: ____________________________<br />Address: __________________________<br />Phone/Email: ______________________<br />Signature: ________________________<br />Date: ____________________________</p>)}
          </div>
        </section>

        <section className="agreement-clause">
          <h3>PAYMENT AND ACCOUNT DETAILS</h3>
          <div className="overflow-hidden rounded border border-slate-200">
            <DetailRow label="Investment Payment Date">{formatAgreementDate(agreement.paymentDate)}</DetailRow>
            <DetailRow label="Payment Reference">{agreement.paymentReference}</DetailRow>
            <DetailRow label="Company Receiving Account">{agreement.company.account.accountName}<br />{agreement.company.account.accountNumber}<br />{agreement.company.account.bankName}</DetailRow>
            <DetailRow label="Investor Verified Account">{agreement.investor.account.accountName}<br />{agreement.investor.account.accountNumber}<br />{agreement.investor.account.bankName}</DetailRow>
          </div>
        </section>

        <footer className="mt-8 border-t border-[#075a3c] pt-3 text-center text-[9px] text-slate-500">
          {agreement.company.name} | RC No. {agreement.company.rcNumber} | {agreement.company.email} | {agreement.company.website} | Tel: {agreement.company.phoneNumbers}
        </footer>
      </article>
    </div>
  );
}
