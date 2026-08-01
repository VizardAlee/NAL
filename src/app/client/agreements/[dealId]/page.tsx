'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Download, FileWarning, Loader2, Printer, Settings } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAgreementCurrency, formatAgreementDate } from '@/lib/agreements/mudaraba';
import { buildWakalahAgreementPdf } from '@/lib/agreements/wakalah-pdf';
import { buildWakalahClauses, type WakalahAgreementModel } from '@/lib/agreements/wakalah';
import { loadClientAgreementAction } from '../actions';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(8.5rem,34%)_1fr] border-b border-slate-200 last:border-b-0"><div className="bg-[#075a3c] px-3 py-2 font-bold text-white">{label}</div><div className="bg-[#f6f1e2] px-3 py-2 text-slate-950">{children}</div></div>;
}

export default function ClientWakalahAgreementPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const auth = useAuth();
  const [agreement, setAgreement] = useState<WakalahAgreementModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, startDownload] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!auth?.currentUser || !dealId) return;
      const result = await loadClientAgreementAction({ authToken: await auth.currentUser.getIdToken(), dealId });
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
      const bytes = await buildWakalahAgreementPdf(agreement);
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

  return (
    <div className="agreement-screen mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div><div className="flex items-center gap-2"><h1 className="font-semibold">Wakalah Procurement Agreement</h1><Badge variant="outline">{agreement.version}</Badge></div><p className="font-mono text-xs text-muted-foreground">{agreement.agreementId}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => window.print()} disabled={!canExport}><Printer className="mr-2 h-4 w-4" /> Print</Button><Button onClick={downloadPdf} disabled={!canExport || downloading}>{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download PDF</Button></div>
      </div>
      {!canExport && <Alert className="mb-5 print:hidden"><FileWarning className="h-4 w-4" /><AlertTitle>Complete your agreement details</AlertTitle><AlertDescription className="space-y-3"><p>Before printing or downloading, add: {agreement.missingFields.join(', ')}.</p><Button asChild size="sm" variant="outline"><Link href="/client/settings"><Settings className="mr-2 h-4 w-4" /> Open Settings</Link></Button></AlertDescription></Alert>}

      <article id="printable-agreement" className="agreement-paper bg-white px-8 py-7 text-[13px] leading-[1.55] text-slate-950 shadow-xl sm:px-14 sm:py-10">
        <header className="mb-6 flex items-center gap-4 border-b-2 border-[#075a3c] pb-4"><img src="/NAL%20LOGO.jpg" alt="NAL logo" className="h-16 w-20 rounded object-cover" /><div><div className="font-serif text-lg font-bold text-[#075a3c]">{agreement.company.name}</div><div className="max-w-xl text-[11px] text-slate-600">{agreement.company.address}</div></div></header>
        <h2 className="mb-5 text-center font-serif text-2xl font-bold text-[#075a3c]">WAKALAH AGREEMENT</h2>
        <div className="mb-7 overflow-hidden rounded border border-slate-200"><DetailRow label="Reference">{agreement.agreementId}</DetailRow><DetailRow label="Deal">{agreement.deal.name}</DetailRow><DetailRow label="Approved Asset">{agreement.deal.assetDescription}</DetailRow><DetailRow label="Approved Supplier">{agreement.deal.supplierName}</DetailRow><DetailRow label="Procurement Funds">{formatAgreementCurrency(agreement.deal.principal)}</DetailRow></div>
        <p className="mb-4 font-bold">THIS WAKALAH AGREEMENT is made this {formatAgreementDate(agreement.agreementDate)} between:</p>
        <h3 className="agreement-heading">BETWEEN</h3><p><strong>{agreement.company.name}</strong>, RC No. {agreement.company.rcNumber}, of {agreement.company.address}, hereinafter referred to as the “Company” or “Financier”, which expression shall, where the context permits, include its successors-in-title and permitted assigns;</p>
        <h3 className="agreement-heading">AND</h3><div className="mb-4 flex items-start gap-4"><p className="flex-1"><strong>{agreement.client.name.toUpperCase()}</strong>, of {agreement.client.address}, hereinafter referred to as the “Customer” or “Agent”, which expression shall, where the context permits, include the Customer’s lawful representatives, heirs and permitted assigns.</p>{agreement.client.photoURL && <img src={agreement.client.photoURL} alt={agreement.client.name} className="h-24 w-20 rounded border object-cover" />}</div>
        <p className="mb-4">At the request of the Customer and strictly for operational convenience, the Company hereby appoints the Customer as its disclosed procurement agent (Wakil), solely for the purpose of identifying, negotiating and purchasing <strong>{agreement.deal.assetDescription}</strong> from <strong>{agreement.deal.supplierName}</strong> on behalf of and in the name of the Company.</p><p className="mb-5">The Customer hereby agrees to be bound by the following terms and undertakings:</p>
        {buildWakalahClauses(agreement).map((clause) => <section key={clause.number} className="agreement-clause"><h3>{clause.number}. {clause.title}</h3><p>{clause.body}</p></section>)}
        <section className="agreement-clause"><h3>EXECUTION</h3><p>IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first above written.</p><div className="mt-5 grid gap-8 sm:grid-cols-2"><div><strong>SIGNED FOR AND ON BEHALF OF NAL GENERAL MERCHANT LTD.</strong><p className="mt-3">Name: NURA LABARAN NUHU<br />Capacity: Director<br />Signature: ________________________<br />Date: ____________________________<br /><br />Name: NAZIR SHARIF FILLO<br />Capacity: Director<br />Signature: ________________________<br />Date: ____________________________<br /><br />Company Stamp/Seal: ____________________</p></div><div><strong>SIGNED BY THE CUSTOMER</strong><p className="mt-3">Name: {agreement.client.name.toUpperCase()}<br />Capacity: Customer / Wakil<br />Signature: ________________________<br />Date: ____________________________</p></div></div></section>
        <section className="agreement-clause"><h3>IN THE PRESENCE OF A WITNESS</h3><p>Name: ______________________________<br />Phone Number: _______________________<br />Address: ____________________________<br />Occupation: _________________________<br />Signature: __________________________ &nbsp; Date: ____________________</p></section>
        <footer className="mt-8 border-t border-[#075a3c] pt-3 text-center text-[9px] text-slate-500">{agreement.company.name} | RC No. {agreement.company.rcNumber} | {agreement.company.email} | {agreement.company.website} | Tel: {agreement.company.phoneNumbers}</footer>
      </article>
    </div>
  );
}
