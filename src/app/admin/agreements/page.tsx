'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Check, FileSignature, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { listAdminAgreementEnvelopesAction, submitAuthenticatedSignatureAction } from '@/app/signing/actions';
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
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [envelopes, setEnvelopes] = useState<AdminEnvelope[]>([]);
  const [selected, setSelected] = useState<{ envelope: AdminEnvelope; role: AgreementSignerRole } | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
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

  const submit = () => startTransition(async () => {
    if (!selected || !auth?.currentUser?.email) return;
    const signatureDataUrl = canvasRef.current?.exportPng();
    if (!signatureDataUrl) { setError('Draw a complete signature.'); return; }
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
      const result = await submitAuthenticatedSignatureAction({ authToken: await auth.currentUser.getIdToken(true), agreementType: selected.envelope.agreementType, sourceId: selected.envelope.sourceId, role: selected.role, signatureDataUrl, consent: true });
      if (!result.success) throw new Error(result.message);
      setSelected(null); setPassword(''); setConsent(false); setHasSignature(false); setError(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to apply the company signature.'); }
  });

  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Agreement signatures</h1><p className="text-sm text-muted-foreground">Review party signatures and execute agreements for NAL.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button></div>
    {error && !selected && <Alert variant="destructive"><AlertTitle>Agreements unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <div className="flex py-16 justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : envelopes.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><FileSignature className="mx-auto mb-3 h-10 w-10" />No signing envelopes yet.</CardContent></Card> : <div className="grid gap-4 xl:grid-cols-2">{envelopes.map((envelope) => {
      const nextRole = envelope.requiredRoles.find((role) => isCompanySignerRole(role) && !envelope.signedRoles.includes(role));
      return <Card key={envelope.envelopeId}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{envelope.agreementReference}</CardTitle><CardDescription>{envelope.agreementType} · Started {new Date(envelope.startedAt).toLocaleDateString('en-NG')}</CardDescription></div><Badge variant={envelope.status === 'EXECUTED' ? 'default' : 'outline'}>{agreementSigningStatusLabel(envelope.status)}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{envelope.requiredRoles.map((role) => <div className="flex items-center justify-between text-sm" key={role}><span>{agreementSignerRoleLabel(role)}</span>{envelope.signedRoles.includes(role) ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-xs text-amber-600">Pending</span>}</div>)}</div>{envelope.status === 'AWAITING_COMPANY' && nextRole && <Button onClick={() => { setSelected({ envelope, role: nextRole }); setError(''); }}><ShieldCheck className="mr-2 h-4 w-4" /> Review and sign as {agreementSignerRoleLabel(nextRole)}</Button>}</CardContent></Card>;
    })}</div>}

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !working) setSelected(null); }}><DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Review and apply NAL signature</DialogTitle><DialogDescription>Review the frozen document in full. Your account, signature, time and document fingerprint will be recorded.</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertTitle>Signature failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}{pdfUrl ? <iframe title="Agreement review" src={pdfUrl} className="h-[48vh] w-full rounded border" /> : <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}<SignatureCanvas ref={canvasRef} onChange={setHasSignature} disabled={working} /><div className="space-y-2"><Label htmlFor="company-sign-password">Confirm your password</Label><Input id="company-sign-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><label className="flex items-start gap-3 rounded border p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} /><span>I reviewed this complete agreement and am authorised to bind NAL with this electronic signature.</span></label><DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={working}>Cancel</Button><Button onClick={submit} disabled={working || !hasSignature || !password || !consent}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify and sign</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
