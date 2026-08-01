'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { loadExternalSigningAction, submitExternalSignatureAction } from '@/app/signing/actions';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/signature-canvas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildKafaalahBondPdf } from '@/lib/agreements/kafaalah-pdf';
import { buildMudarabaAgreementPdf } from '@/lib/agreements/mudaraba-pdf';
import type { AgreementDocumentModel, AgreementSigningState } from '@/lib/agreements/signing';
import { buildWakalahAgreementPdf } from '@/lib/agreements/wakalah-pdf';

type SigningRequest = {
  role: 'GUARANTOR' | 'WITNESS';
  roleLabel: string;
  agreementReference: string;
  documentHash: string;
  documentModel: AgreementDocumentModel;
  state: AgreementSigningState;
  expiresAt: string;
  expectedSignerName?: string;
};

async function buildPreview(request: SigningRequest) {
  if (request.state.agreementType === 'MUDARABA') return buildMudarabaAgreementPdf(request.documentModel as never, request.state);
  if (request.state.agreementType === 'WAKALAH') return buildWakalahAgreementPdf(request.documentModel as never, request.state);
  return buildKafaalahBondPdf(request.documentModel as never, request.state);
}

export default function ExternalSigningPage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [request, setRequest] = useState<SigningRequest | null>(null);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [signerName, setSignerName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [working, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void loadExternalSigningAction({ token }).then((result) => {
      if (!active) return;
      if (!result.success) { setError(result.message); return; }
      setRequest(result);
      if (result.expectedSignerName) setSignerName(result.expectedSignerName);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!request) return;
    let active = true;
    let objectUrl = '';
    void buildPreview(request).then((bytes) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setPdfUrl(objectUrl);
    }).catch(() => setError('The agreement preview could not be produced.'));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [request]);

  const submit = () => startTransition(async () => {
    const signatureDataUrl = canvasRef.current?.exportPng();
    if (!signatureDataUrl) { setError('Draw a complete signature before continuing.'); return; }
    setError('');
    const result = await submitExternalSignatureAction({
      token, pin, signerName, signerPhoneNumber: phone, signatureDataUrl, consent: true,
    });
    if (!result.success) { setError(result.message); return; }
    setCompleted(true);
  });

  if (completed) return <main className="mx-auto flex min-h-screen max-w-xl items-center p-5"><Card className="w-full border-emerald-200"><CardContent className="py-10 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-semibold">Signature recorded</h1><p className="mt-2 text-muted-foreground">NAL and the agreement owner have been notified. This secure link cannot be used again.</p></CardContent></Card></main>;

  if (error && !request) return <main className="mx-auto flex min-h-screen max-w-xl items-center p-5"><Alert variant="destructive"><LockKeyhole className="h-4 w-4" /><AlertTitle>Signing request unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main>;
  if (!request) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></main>;

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 bg-slate-50 p-4 sm:p-6">
      <Card><CardHeader><div className="flex items-start gap-3"><FileCheck2 className="mt-1 h-6 w-6 text-primary" /><div><CardTitle>Review and sign as {request.roleLabel}</CardTitle><CardDescription>{request.agreementReference} · Link expires {new Date(request.expiresAt).toLocaleString('en-NG')}</CardDescription></div></div></CardHeader><CardContent><div className="rounded bg-slate-950 p-3 font-mono text-[10px] text-slate-300"><span className="text-white">Document SHA-256: </span><span className="break-all">{request.documentHash}</span></div></CardContent></Card>

      <Card><CardHeader><CardTitle>1. Review the complete agreement</CardTitle><CardDescription>Scroll through every page before signing. This is the exact frozen version your signature will be bound to.</CardDescription></CardHeader><CardContent>{pdfUrl ? <iframe title="Agreement to review" src={pdfUrl} className="h-[68vh] w-full rounded border bg-white" /> : <div className="flex h-80 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}</CardContent></Card>

      <Card><CardHeader><CardTitle>2. Verify and sign</CardTitle><CardDescription>Use a finger or stylus on a phone, or click and drag with a trackpad or mouse on a laptop.</CardDescription></CardHeader><CardContent className="space-y-5">
        {error && <Alert variant="destructive"><AlertTitle>Signature not submitted</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="signer-name">Full legal name</Label><Input id="signer-name" value={signerName} onChange={(event) => setSignerName(event.target.value)} readOnly={Boolean(request.expectedSignerName)} /></div><div className="space-y-2"><Label htmlFor="signer-phone">Phone number</Label><Input id="signer-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div></div>
        <div className="max-w-xs space-y-2"><Label htmlFor="signing-pin">Six-digit signing PIN</Label><Input id="signing-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="font-mono text-lg tracking-[0.3em]" /></div>
        <SignatureCanvas ref={canvasRef} onChange={setHasSignature} disabled={working} />
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" /><span>I have reviewed the complete agreement, accept its terms, consent to electronic records and intend this electronic signature to be legally binding.</span></label>
        <Button size="lg" onClick={submit} disabled={working || !hasSignature || !signerName.trim() || !phone.trim() || pin.length !== 6 || !consent}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Apply secure signature</Button>
      </CardContent></Card>
    </main>
  );
}
