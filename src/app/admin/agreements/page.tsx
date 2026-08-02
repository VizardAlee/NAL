'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Check, Download, Eye, FileSignature, Loader2, PenLine, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { getAgreementSigningStateAction, listAdminAgreementEnvelopesAction, submitAuthenticatedSignatureAction } from '@/app/signing/actions';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/signature-canvas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { buildKafaalahBondPdf } from '@/lib/agreements/kafaalah-pdf';
import { buildMudarabaAgreementPdf } from '@/lib/agreements/mudaraba-pdf';
import { agreementSignerRoleLabel, agreementSigningStatusLabel, isCompanySignerRole, type AgreementDocumentModel, type AgreementSignerRole, type AgreementSigningState } from '@/lib/agreements/signing';
import { buildWakalahAgreementPdf } from '@/lib/agreements/wakalah-pdf';

type AdminEnvelope = AgreementSigningState & { documentModel: AgreementDocumentModel };

async function makePdf(envelope: AdminEnvelope) {
  if (envelope.agreementType === 'MUDARABA') return buildMudarabaAgreementPdf(envelope.documentModel as never, envelope);
  if (envelope.agreementType === 'WAKALAH') return buildWakalahAgreementPdf(envelope.documentModel as never, envelope);
  return buildKafaalahBondPdf(envelope.documentModel as never, envelope);
}

export default function AdminAgreementsPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [envelopes, setEnvelopes] = useState<AdminEnvelope[]>([]);
  const [selected, setSelected] = useState<{ envelope: AdminEnvelope; role?: AgreementSignerRole } | null>(null);
  const [openingId, setOpeningId] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureSheetOpen, setSignatureSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    const result = await listAdminAgreementEnvelopesAction({ authToken: await auth.currentUser.getIdToken() });
    if (result.success) { setEnvelopes(result.envelopes); setError(''); } else setError(result.message);
    setLoading(false);
  }, [auth]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setPdfUrl(''); return; }
    let active = true; let url = '';
    void makePdf(selected.envelope).then((bytes) => { if (!active) return; url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })); setPdfUrl(url); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [selected]);

  const openAgreement = async (envelope: AdminEnvelope, role?: AgreementSignerRole) => {
    if (!auth?.currentUser) return;
    setOpeningId(envelope.envelopeId);
    setError('');
    setPassword('');
    setConsent(false);
    setHasSignature(false);
    setSignatureSheetOpen(false);
    try {
      const result = await getAgreementSigningStateAction({
        authToken: await auth.currentUser.getIdToken(),
        agreementType: envelope.agreementType,
        sourceId: envelope.sourceId,
      });
      if (!result.success || !result.exists) throw new Error(result.success ? 'Agreement not found.' : result.message);
      setSelected({ envelope: { ...result.state, documentModel: result.documentModel }, ...(role ? { role } : {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this agreement.');
    } finally {
      setOpeningId('');
    }
  };

  const printAgreement = () => {
    previewRef.current?.contentWindow?.focus();
    previewRef.current?.contentWindow?.print();
  };

  const downloadAgreement = () => {
    if (!selected || !pdfUrl) return;
    const anchor = document.createElement('a');
    anchor.href = pdfUrl;
    anchor.download = `${selected.envelope.agreementReference.replace(/[^a-zA-Z0-9._-]/g, '-')}.pdf`;
    anchor.click();
  };

  const submit = () => startTransition(async () => {
    if (!selected?.role || !auth?.currentUser?.email) return;
    const signatureDataUrl = canvasRef.current?.exportPng();
    if (!signatureDataUrl) { setError('Draw a complete signature.'); return; }
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
      const result = await submitAuthenticatedSignatureAction({ authToken: await auth.currentUser.getIdToken(true), agreementType: selected.envelope.agreementType, sourceId: selected.envelope.sourceId, role: selected.role, signatureDataUrl, consent: true });
      if (!result.success) throw new Error(result.message);
      const executed = result.state.status === 'EXECUTED';
      setSignatureSheetOpen(false); setSelected(null); setPassword(''); setConsent(false); setHasSignature(false); setError('');
      toast({ title: executed ? 'Agreement fully executed' : 'NAL signature recorded', description: executed ? 'The final signed agreement is now ready to print or download.' : 'A different authorised administrator must provide the remaining NAL signature.' });
      await load();
    } catch (cause) {
      const firebaseCode = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      const message = firebaseCode.includes('auth/invalid-credential') || firebaseCode.includes('auth/wrong-password')
        ? 'The administrator password is incorrect.'
        : cause instanceof Error ? cause.message : 'Unable to apply the company signature.';
      setError(message);
    }
  });

  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Agreement signatures</h1><p className="text-sm text-muted-foreground">Review party signatures and execute agreements for NAL.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button></div>
    {error && !selected && <Alert variant="destructive"><AlertTitle>Agreements unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <div className="flex py-16 justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : envelopes.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><FileSignature className="mx-auto mb-3 h-10 w-10" />No signing envelopes yet.</CardContent></Card> : <div className="grid gap-4 xl:grid-cols-2">{envelopes.map((envelope) => {
      const nextRole = envelope.requiredRoles.find((role) => isCompanySignerRole(role) && !envelope.signedRoles.includes(role));
      return <Card key={envelope.envelopeId}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{envelope.agreementReference}</CardTitle><CardDescription>{envelope.agreementType} · Started {new Date(envelope.startedAt).toLocaleDateString('en-NG')}</CardDescription></div><Badge variant={envelope.status === 'EXECUTED' ? 'default' : 'outline'}>{agreementSigningStatusLabel(envelope.status)}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{envelope.requiredRoles.map((role) => <div className="flex items-center justify-between text-sm" key={role}><span>{agreementSignerRoleLabel(role)}</span>{envelope.signedRoles.includes(role) ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-xs text-amber-600">Pending</span>}</div>)}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void openAgreement(envelope)} disabled={Boolean(openingId)}>{openingId === envelope.envelopeId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />} View agreement</Button>{envelope.status === 'AWAITING_COMPANY' && nextRole && <Button onClick={() => void openAgreement(envelope, nextRole)} disabled={Boolean(openingId)}><ShieldCheck className="mr-2 h-4 w-4" /> Review and sign as {agreementSignerRoleLabel(nextRole)}</Button>}</div></CardContent></Card>;
    })}</div>}

    <Dialog open={Boolean(selected) && !signatureSheetOpen} onOpenChange={(open) => { if (!open && !working && !signatureSheetOpen) setSelected(null); }}><DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.role ? 'Review agreement before signing' : 'View agreement'}</DialogTitle><DialogDescription>{selected?.role ? 'Review the frozen document in full. When satisfied, open the separate NAL signature sheet.' : 'View, print or download this frozen agreement and its recorded signatures.'}</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertTitle>{selected?.role ? 'Signature failed' : 'Agreement unavailable'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={downloadAgreement} disabled={!pdfUrl}><Download className="mr-2 h-4 w-4" /> Download PDF</Button><Button variant="outline" onClick={printAgreement} disabled={!pdfUrl}><Printer className="mr-2 h-4 w-4" /> Print</Button></div>{pdfUrl ? <iframe ref={previewRef} title="Agreement review" src={pdfUrl} className="h-[58vh] w-full rounded border" /> : <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}{selected?.role && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Administrator authorisation required</AlertTitle><AlertDescription>Your verified account, signature, signing time and the document fingerprint will be recorded. Two-signatory agreements must be signed by two different authorised accounts.</AlertDescription></Alert>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={working}>Close</Button>{selected?.role && <Button onClick={() => { setError(''); setSignatureSheetOpen(true); }} disabled={!pdfUrl}><PenLine className="mr-2 h-4 w-4" /> Open NAL signature sheet</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(selected?.role) && signatureSheetOpen} onOpenChange={(open) => { if (!working) setSignatureSheetOpen(open); }}><DialogContent className="max-h-[94vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Blank NAL signature sheet — {selected?.role ? agreementSignerRoleLabel(selected.role) : ''}</DialogTitle><DialogDescription>Draw inside the white sheet. Your strokes appear immediately and will be bound only to {selected?.envelope.agreementReference || 'this agreement'}.</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertTitle>Signature failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}<div className="rounded-xl border-2 border-slate-300 bg-white p-3 shadow-inner"><p className="mb-2 text-sm font-semibold text-slate-900">Authorised administrator signature</p><SignatureCanvas ref={canvasRef} onChange={setHasSignature} disabled={working} /></div><div className="space-y-2"><Label htmlFor="company-sign-password">Confirm your administrator password</Label><Input id="company-sign-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><label className="flex items-start gap-3 rounded border p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} /><span>I reviewed the complete frozen agreement, confirm that I am authorised to bind NAL, and intend this electronic signature to be legally binding.</span></label><DialogFooter><Button variant="outline" onClick={() => setSignatureSheetOpen(false)} disabled={working}>Back to agreement</Button><Button onClick={submit} disabled={working || !hasSignature || !password || !consent}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Verify and apply NAL signature</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
