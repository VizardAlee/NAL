import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, BadgeCheck, FileCheck2, Fingerprint, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { verifyExecutedAgreement } from '@/lib/server/agreement-verification';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Verify Agreement | NAL General Merchant',
  robots: { index: false, follow: false },
};

export default async function VerifyAgreementPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let verification = null;
  let unavailable = false;
  try {
    verification = await verifyExecutedAgreement(code);
  } catch (error) {
    unavailable = true;
    console.error('Public agreement verification failed.', error);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/" className="inline-flex items-center gap-3 text-primary"><Logo imageUrl="/NAL%20LOGO.jpg" className="h-11 w-11" /><span className="text-lg font-semibold">NAL General Merchant Ltd.</span></Link>
        {!verification ? (
          <Card className="border-red-200"><CardHeader><CardTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-6 w-6" /> {unavailable ? 'Verification temporarily unavailable' : 'Agreement not verified'}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>{unavailable ? 'NAL could not reach the verification register. Please try scanning again shortly.' : 'This QR code or verification reference does not match a fully executed agreement in the NAL register.'}</p><p>Do not rely on the document until NAL confirms it through an official channel.</p></CardContent></Card>
        ) : (
          <>
            <Card className="overflow-hidden border-emerald-300"><div className="bg-emerald-700 px-5 py-4 text-white"><div className="flex items-center gap-3"><BadgeCheck className="h-9 w-9" /><div><h1 className="text-xl font-semibold">Genuine NAL agreement</h1><p className="text-sm text-emerald-100">The sealed record and all required signatures are valid.</p></div></div></div><CardContent className="space-y-5 pt-6"><div className="flex flex-wrap items-center gap-2"><Badge>{verification.agreementType}</Badge><Badge variant="outline">Fully executed</Badge></div><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Agreement reference</dt><dd className="font-semibold">{verification.agreementReference}</dd></div><div><dt className="text-muted-foreground">Executed</dt><dd className="font-semibold">{new Date(verification.executedAt).toLocaleString('en-NG')}</dd></div><div><dt className="text-muted-foreground">Primary party</dt><dd className="font-semibold">{verification.primaryParty}</dd></div>{verification.secondaryParty && <div><dt className="text-muted-foreground">Guarantor</dt><dd className="font-semibold">{verification.secondaryParty}</dd></div>}<div><dt className="text-muted-foreground">Agreement amount</dt><dd className="font-semibold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(verification.amount)}</dd></div></dl></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5 text-primary" /> Verified signatures</CardTitle></CardHeader><CardContent className="space-y-3">{verification.signatures.map((signature) => <div key={signature.role} className="flex flex-col justify-between gap-1 rounded-lg border p-3 text-sm sm:flex-row"><div><div className="font-medium">{signature.role}</div><div className="text-muted-foreground">{signature.signerName} · {new Date(signature.signedAt).toLocaleString('en-NG')}</div></div><div className="font-mono text-xs text-emerald-700">{signature.verificationReference}</div></div>)}</CardContent></Card>
            <Card><CardContent className="space-y-3 pt-6"><div className="flex items-center gap-2 font-medium"><Fingerprint className="h-5 w-5 text-primary" /> Executed-envelope fingerprint</div><p className="break-all rounded bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">{verification.fingerprint}</p><p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Compare the agreement reference, parties and amount above with the document in front of you. Any mismatch should be reported to NAL.</p></CardContent></Card>
          </>
        )}
      </div>
    </main>
  );
}
