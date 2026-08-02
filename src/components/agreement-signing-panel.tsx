'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Check, Clipboard, ExternalLink, FileLock2, KeyRound, Loader2, PenLine, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/signature-canvas';
import {
  agreementSignerRoleLabel,
  agreementSigningStatusLabel,
  isExternalSignerRole,
  type AgreementDocumentModel,
  type AgreementSignerRole,
  type AgreementSigningState,
  type AgreementSigningType,
  type ExternalSignerRole,
} from '@/lib/agreements/signing';
import {
  createExternalSigningInviteAction,
  getAgreementSigningStateAction,
  startAgreementSigningAction,
  submitAuthenticatedSignatureAction,
} from '@/app/signing/actions';

type InviteDetails = { signingUrl: string; pin: string; expiresAt: string; role: ExternalSignerRole };

export function AgreementSigningPanel({
  agreementType,
  sourceId,
  primaryRole,
  disabled = false,
  onStateChange,
  onFrozenDocument,
}: {
  agreementType: AgreementSigningType;
  sourceId: string;
  primaryRole?: 'INVESTOR' | 'CLIENT';
  disabled?: boolean;
  onStateChange?: (state: AgreementSigningState | null) => void;
  onFrozenDocument?: (model: AgreementDocumentModel) => void;
}) {
  const auth = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<AgreementSigningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, startTransition] = useTransition();
  const [signingRole, setSigningRole] = useState<AgreementSignerRole | null>(null);
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const canvasRef = useRef<SignatureCanvasHandle>(null);

  const updateState = useCallback((next: AgreementSigningState | null) => {
    setState(next);
    onStateChange?.(next);
  }, [onStateChange]);

  const load = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    const result = await getAgreementSigningStateAction({
      authToken: await auth.currentUser.getIdToken(), agreementType, sourceId,
    });
    if (result.success) {
      if (result.exists) {
        updateState(result.state);
        onFrozenDocument?.(result.documentModel);
      } else updateState(null);
    }
    setLoading(false);
  }, [agreementType, auth, onFrozenDocument, sourceId, updateState]);

  useEffect(() => { void load(); }, [load]);

  const startSigning = () => startTransition(async () => {
    const result = await startAgreementSigningAction({
      authToken: await getRequiredIdToken(), agreementType, sourceId,
    });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Signing could not start', description: result.message });
      return;
    }
    updateState(result.state);
    toast({ title: 'Signing started', description: 'This agreement version is now locked for signatures.' });
  });

  const submitSignature = () => startTransition(async () => {
    if (!signingRole) return;
    const signatureDataUrl = canvasRef.current?.exportPng();
    if (!signatureDataUrl) {
      toast({ variant: 'destructive', title: 'Signature required', description: 'Draw a complete signature before continuing.' });
      return;
    }
    const currentUser = auth?.currentUser;
    if (!currentUser?.email) {
      toast({ variant: 'destructive', title: 'Verification unavailable', description: 'A verified email account is required to sign.' });
      return;
    }
    try {
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password));
      const result = await submitAuthenticatedSignatureAction({
        authToken: await currentUser.getIdToken(true), agreementType, sourceId,
        role: signingRole, signatureDataUrl, consent: true,
      });
      if (!result.success) throw new Error(result.message);
      updateState(result.state);
      setSigningRole(null); setPassword(''); setConsent(false); setHasSignature(false);
      toast({ title: 'Signature recorded', description: 'Your signature and verification evidence were securely recorded.' });
    } catch (error) {
      const message = error instanceof Error && error.message.includes('auth/invalid-credential')
        ? 'The password is incorrect.'
        : error instanceof Error ? error.message : 'Unable to verify and apply your signature.';
      toast({ variant: 'destructive', title: 'Signature failed', description: message });
    }
  });

  const createInvite = (role: ExternalSignerRole) => startTransition(async () => {
    const result = await createExternalSigningInviteAction({
      authToken: await getRequiredIdToken(), agreementType, sourceId, role,
    });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Link creation failed', description: result.message });
      return;
    }
    updateState(result.state);
    setInvite({ signingUrl: result.signingUrl, pin: result.pin, expiresAt: result.expiresAt, role });
  });

  if (loading) return <Card><CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading secure signing status…</CardContent></Card>;

  const primaryCanSign = Boolean(
    state && primaryRole && state.requiredRoles.includes(primaryRole) && !state.signedRoles.includes(primaryRole)
  );

  return (
    <>
      <Card className="border-primary/20 shadow-sm print:hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2"><FileLock2 className="h-5 w-5 text-primary" /> Secure electronic signing</CardTitle><CardDescription>Trackpad, mouse, touch and stylus signatures are supported.</CardDescription></div>
            <Badge variant={state?.status === 'EXECUTED' ? 'default' : 'outline'}>{agreementSigningStatusLabel(state?.status || 'NOT_STARTED')}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3"><strong className="block text-foreground">1. Freeze</strong><span className="text-muted-foreground">Lock the exact document version.</span></div>
            <div className="rounded-lg border bg-muted/20 p-3"><strong className="block text-foreground">2. Parties sign</strong><span className="text-muted-foreground">Named parties review, verify and sign.</span></div>
            <div className="rounded-lg border bg-muted/20 p-3"><strong className="block text-foreground">3. NAL signs</strong><span className="text-muted-foreground">An authorised account countersigns.</span></div>
            <div className="rounded-lg border bg-muted/20 p-3"><strong className="block text-foreground">4. Execute</strong><span className="text-muted-foreground">Seal, stamp and unlock the final PDF.</span></div>
          </div>
          {!state ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Starting creates an immutable agreement version and audit record. Profile or transaction changes made afterward will not alter that version.</p>
              <Button onClick={startSigning} disabled={disabled || working}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start secure signing</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {state.requiredRoles.map((role) => {
                  const signature = state.signatures[role];
                  return <div key={role} className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{agreementSignerRoleLabel(role)}</span>{signature ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />}</div><p className="mt-1 text-xs text-muted-foreground">{signature ? `${signature.signerName} · ${new Date(signature.signedAt).toLocaleString('en-NG')}` : 'Awaiting signature'}</p></div>;
                })}
              </div>
              <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-200"><div>Document SHA-256</div><div className="mt-1 break-all text-slate-400">{state.documentHash}</div>{state.finalDocumentHash && <><div className="mt-3">Executed envelope SHA-256</div><div className="mt-1 break-all text-emerald-300">{state.finalDocumentHash}</div></>}</div>
              <div className="flex flex-wrap gap-2">
                {primaryCanSign && <Button onClick={() => setSigningRole(primaryRole!)}><PenLine className="mr-2 h-4 w-4" /> Sign agreement</Button>}
                {state.requiredRoles.filter(isExternalSignerRole).map((role) => !state.signedRoles.includes(role) && (
                  <Button key={role} variant="outline" onClick={() => createInvite(role)} disabled={working}><Send className="mr-2 h-4 w-4" /> {state.invites.some((item) => item.role === role && item.status === 'ACTIVE') ? 'Replace' : 'Create'} {agreementSignerRoleLabel(role)} link</Button>
                ))}
              </div>
              {state.status === 'EXECUTED' && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Fully executed and locked</AlertTitle><AlertDescription>The signatures, audit events and final document fingerprint have been sealed. Any amendment must create a new agreement version.</AlertDescription></Alert>}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(signingRole)} onOpenChange={(open) => { if (!open && !working) setSigningRole(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Sign as {signingRole ? agreementSignerRoleLabel(signingRole) : ''}</DialogTitle><DialogDescription>Your signature will be bound to this exact document version and cannot be moved to another agreement.</DialogDescription></DialogHeader>
          <SignatureCanvas ref={canvasRef} onChange={setHasSignature} disabled={working} />
          <div className="space-y-2"><Label htmlFor="signing-password">Confirm your current password</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="signing-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" autoComplete="current-password" /></div></div>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" /><span>I have reviewed the complete agreement, accept its terms, consent to electronic records and intend this electronic signature to be legally binding.</span></label>
          <DialogFooter><Button variant="outline" onClick={() => setSigningRole(null)} disabled={working}>Cancel</Button><Button onClick={submitSignature} disabled={working || !hasSignature || !password || !consent}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Verify and sign</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invite)} onOpenChange={(open) => { if (!open) setInvite(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Secure {invite ? agreementSignerRoleLabel(invite.role) : ''} invitation</DialogTitle><DialogDescription>Send the link and PIN through separate channels where practical. The link expires after 72 hours and can be used only once.</DialogDescription></DialogHeader>
          {invite && <div className="space-y-4"><div><Label>Signing link</Label><div className="mt-1 flex gap-2"><Input readOnly value={invite.signingUrl} className="font-mono text-xs" /><Button size="icon" variant="outline" onClick={() => void navigator.clipboard.writeText(invite.signingUrl)}><Clipboard className="h-4 w-4" /></Button></div></div><div><Label>Six-digit signing PIN</Label><div className="mt-1 flex gap-2"><Input readOnly value={invite.pin} className="font-mono text-lg tracking-[0.35em]" /><Button size="icon" variant="outline" onClick={() => void navigator.clipboard.writeText(invite.pin)}><Clipboard className="h-4 w-4" /></Button></div></div><Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>For the named signer only</AlertTitle><AlertDescription>Hand the device to the named signer or share the link and PIN securely. Do not draw another person&apos;s signature for them.</AlertDescription></Alert></div>}
          <DialogFooter>{invite && <Button variant="outline" asChild><a href={invite.signingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Open signature intake</a></Button>}<Button onClick={() => setInvite(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
