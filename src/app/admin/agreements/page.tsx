'use client';

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Check, Download, Eye, FileSignature, Loader2, PenLine, Printer, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { downloadExecutedAgreementArchiveAction, getAgreementSigningStateAction, listAdminAgreementEnvelopesAction, submitAuthenticatedSignatureAction } from '@/app/signing/actions';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/signature-canvas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { buildKafaalahBondPdf } from '@/lib/agreements/kafaalah-pdf';
import { buildMudarabaAgreementPdf } from '@/lib/agreements/mudaraba-pdf';
import { buildMurabahaAgreementPdf } from '@/lib/agreements/murabaha-pdf';
import { agreementSignerRoleLabel, agreementSigningStatusLabel, isCompanySignerRole, type AgreementDocumentModel, type AgreementSignerRole, type AgreementSigningState, type AgreementSigningStatus, type AgreementSigningType } from '@/lib/agreements/signing';
import { buildWakalahAgreementPdf } from '@/lib/agreements/wakalah-pdf';

type AdminEnvelope = AgreementSigningState;
type AdminEnvelopeWithDocument = AdminEnvelope & { documentModel: AgreementDocumentModel };

async function makePdf(envelope: AdminEnvelopeWithDocument) {
  if (envelope.agreementType === 'MUDARABA') return buildMudarabaAgreementPdf(envelope.documentModel as never, envelope);
  if (envelope.agreementType === 'MURABAHA') return buildMurabahaAgreementPdf(envelope.documentModel as never, envelope);
  if (envelope.agreementType === 'WAKALAH') return buildWakalahAgreementPdf(envelope.documentModel as never, envelope);
  return buildKafaalahBondPdf(envelope.documentModel as never, envelope);
}

function saveBase64Pdf(pdfBase64: string, fileName: string) {
  const binary = window.atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function AdminAgreementsPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [envelopes, setEnvelopes] = useState<AdminEnvelope[]>([]);
  const [selected, setSelected] = useState<{ envelope: AdminEnvelopeWithDocument; role?: AgreementSignerRole } | null>(null);
  const [openingId, setOpeningId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureSheetOpen, setSignatureSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [agreementType, setAgreementType] = useState<AgreementSigningType | 'ALL'>('ALL');
  const [status, setStatus] = useState<AgreementSigningStatus | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [working, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    const result = await listAdminAgreementEnvelopesAction({
      authToken: await auth.currentUser.getIdToken(),
      page,
      pageSize,
      search,
      ...(agreementType !== 'ALL' ? { agreementType } : {}),
      ...(status !== 'ALL' ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    if (result.success) {
      setEnvelopes(result.envelopes);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (result.page !== page) setPage(result.page);
      setError('');
    } else setError(result.message);
    setLoading(false);
  }, [agreementType, auth, dateFrom, dateTo, page, pageSize, search, status]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setAgreementType('ALL');
    setStatus('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters = Boolean(search || agreementType !== 'ALL' || status !== 'ALL' || dateFrom || dateTo);
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((candidate) => candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1);

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

  const downloadSignedCopy = async (envelope: AdminEnvelope) => {
    if (!auth?.currentUser) return;
    setDownloadingId(envelope.envelopeId);
    setError('');
    try {
      const result = await downloadExecutedAgreementArchiveAction({
        authToken: await auth.currentUser.getIdToken(),
        agreementType: envelope.agreementType,
        sourceId: envelope.sourceId,
      });
      if (!result.success) throw new Error(result.message);
      saveBase64Pdf(result.pdfBase64, result.fileName);
      toast({ title: 'Signed copy downloaded', description: `Permanent archive verified: ${result.fileHash.slice(0, 16).toUpperCase()}.` });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to download the signed copy.';
      setError(message);
      toast({ variant: 'destructive', title: 'Download failed', description: message });
    } finally {
      setDownloadingId('');
    }
  };

  const downloadAgreement = () => {
    if (!selected || !pdfUrl) return;
    if (selected.envelope.status === 'EXECUTED') {
      void downloadSignedCopy(selected.envelope);
      return;
    }
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

  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Agreement signatures</h1><p className="text-sm text-muted-foreground">Review party signatures and execute agreements for NAL.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button></div>
    {error && !selected && <Alert variant="destructive"><AlertTitle>Agreements unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardContent className="pt-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"><div className="space-y-2 md:col-span-2 xl:col-span-2"><Label htmlFor="agreement-search">Search agreements</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="agreement-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Reference, party, deal or account" className="pl-9" /></div></div><div className="space-y-2"><Label>Agreement type</Label><Select value={agreementType} onValueChange={(value) => { setAgreementType(value as AgreementSigningType | 'ALL'); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All types</SelectItem><SelectItem value="MUDARABA">Mudaraba</SelectItem><SelectItem value="MURABAHA">Murabaha</SelectItem><SelectItem value="WAKALAH">Wakalah</SelectItem><SelectItem value="KAFAALAH">Kafaalah</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Signing status</Label><Select value={status} onValueChange={(value) => { setStatus(value as AgreementSigningStatus | 'ALL'); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem><SelectItem value="AWAITING_SIGNATURES">Awaiting parties</SelectItem><SelectItem value="AWAITING_COMPANY">Awaiting NAL</SelectItem><SelectItem value="EXECUTED">Fully executed</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="agreement-date-from">From date</Label><Input id="agreement-date-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></div><div className="space-y-2"><Label htmlFor="agreement-date-to">To date</Label><Input id="agreement-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground" aria-live="polite">{loading ? 'Updating results…' : total === 0 ? 'No matching agreements' : `Showing ${firstResult}–${lastResult} of ${total} agreement${total === 1 ? '' : 's'}`}</p><div className="flex items-center gap-2">{hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}><X className="mr-2 h-4 w-4" /> Clear filters</Button>}<Label htmlFor="agreement-page-size" className="whitespace-nowrap text-xs text-muted-foreground">Per page</Label><Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger id="agreement-page-size" className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5">5</SelectItem><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent></Select></div></div></CardContent></Card>
    {loading ? <div className="flex py-16 justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : envelopes.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><FileSignature className="mx-auto mb-3 h-10 w-10" />{hasFilters ? 'No agreements match the selected filters.' : 'No signing envelopes yet.'}</CardContent></Card> : <><div className="grid gap-4 xl:grid-cols-2">{envelopes.map((envelope) => {
      const nextRole = envelope.requiredRoles.find((role) => isCompanySignerRole(role) && !envelope.signedRoles.includes(role));
      return <Card key={envelope.envelopeId}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{envelope.agreementReference}</CardTitle><CardDescription>{envelope.agreementType} · Started {new Date(envelope.startedAt).toLocaleDateString('en-NG')}</CardDescription></div><Badge variant={envelope.status === 'EXECUTED' ? 'default' : 'outline'}>{agreementSigningStatusLabel(envelope.status)}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{envelope.requiredRoles.map((role) => <div className="flex items-center justify-between text-sm" key={role}><span>{agreementSignerRoleLabel(role)}</span>{envelope.signedRoles.includes(role) ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-xs text-amber-600">Pending</span>}</div>)}</div>{envelope.status === 'EXECUTED' && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><div className="font-medium">{envelope.finalPdfArchive?.status === 'ARCHIVED' ? 'Permanent signed copy archived' : envelope.finalPdfArchive?.status === 'FAILED' ? 'Signed copy needs archive retry' : 'Signed copy will be archived on download'}</div>{envelope.finalPdfArchive?.fileHash && <div className="mt-1 break-all font-mono text-[10px] text-emerald-700">PDF SHA-256: {envelope.finalPdfArchive.fileHash}</div>}</div>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void openAgreement(envelope)} disabled={Boolean(openingId)}>{openingId === envelope.envelopeId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />} View agreement</Button>{envelope.status === 'EXECUTED' && <Button onClick={() => void downloadSignedCopy(envelope)} disabled={Boolean(downloadingId)}>{downloadingId === envelope.envelopeId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download signed copy</Button>}{envelope.status === 'AWAITING_COMPANY' && nextRole && <Button onClick={() => void openAgreement(envelope, nextRole)} disabled={Boolean(openingId)}><ShieldCheck className="mr-2 h-4 w-4" /> Review and sign as {agreementSignerRoleLabel(nextRole)}</Button>}</div></CardContent></Card>;
    })}</div>{totalPages > 1 && <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} aria-disabled={page === 1} className={page === 1 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>{visiblePages.map((pageNumber, index) => <Fragment key={pageNumber}>{index > 0 && pageNumber - visiblePages[index - 1] > 1 && <PaginationItem><span className="flex h-9 w-9 items-center justify-center text-muted-foreground">…</span></PaginationItem>}<PaginationItem><PaginationLink href="#" isActive={pageNumber === page} onClick={(event) => { event.preventDefault(); setPage(pageNumber); }}>{pageNumber}</PaginationLink></PaginationItem></Fragment>)}<PaginationItem><PaginationNext href="#" onClick={(event) => { event.preventDefault(); if (page < totalPages) setPage(page + 1); }} aria-disabled={page === totalPages} className={page === totalPages ? 'pointer-events-none opacity-50' : ''} /></PaginationItem></PaginationContent></Pagination>}</>}

    <Dialog open={Boolean(selected) && !signatureSheetOpen} onOpenChange={(open) => { if (!open && !working && !signatureSheetOpen) setSelected(null); }}><DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.role ? 'Review agreement before signing' : 'View agreement'}</DialogTitle><DialogDescription>{selected?.role ? 'Review the frozen document in full. When satisfied, open the separate NAL signature sheet.' : 'View, print or download this frozen agreement and its recorded signatures.'}</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertTitle>{selected?.role ? 'Signature failed' : 'Agreement unavailable'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={downloadAgreement} disabled={!pdfUrl}><Download className="mr-2 h-4 w-4" /> Download PDF</Button><Button variant="outline" onClick={printAgreement} disabled={!pdfUrl}><Printer className="mr-2 h-4 w-4" /> Print</Button></div>{pdfUrl ? <iframe ref={previewRef} title="Agreement review" src={pdfUrl} className="h-[58vh] w-full rounded border" /> : <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}{selected?.role && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Administrator authorisation required</AlertTitle><AlertDescription>Your verified account, signature, signing time and the document fingerprint will be recorded. Two-signatory agreements must be signed by two different authorised accounts.</AlertDescription></Alert>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={working}>Close</Button>{selected?.role && <Button onClick={() => { setError(''); setSignatureSheetOpen(true); }} disabled={!pdfUrl}><PenLine className="mr-2 h-4 w-4" /> Open NAL signature sheet</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(selected?.role) && signatureSheetOpen} onOpenChange={(open) => { if (!working) setSignatureSheetOpen(open); }}><DialogContent className="max-h-[94vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Blank NAL signature sheet — {selected?.role ? agreementSignerRoleLabel(selected.role) : ''}</DialogTitle><DialogDescription>Draw inside the white sheet. Your strokes appear immediately and will be bound only to {selected?.envelope.agreementReference || 'this agreement'}.</DialogDescription></DialogHeader>{error && <Alert variant="destructive"><AlertTitle>Signature failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}<div className="rounded-xl border-2 border-slate-300 bg-white p-3 shadow-inner"><p className="mb-2 text-sm font-semibold text-slate-900">Authorised administrator signature</p><SignatureCanvas ref={canvasRef} onChange={setHasSignature} disabled={working} /></div><div className="space-y-2"><Label htmlFor="company-sign-password">Confirm your administrator password</Label><Input id="company-sign-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><label className="flex items-start gap-3 rounded border p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} /><span>I reviewed the complete frozen agreement, confirm that I am authorised to bind NAL, and intend this electronic signature to be legally binding.</span></label><DialogFooter><Button variant="outline" onClick={() => setSignatureSheetOpen(false)} disabled={working}>Back to agreement</Button><Button onClick={submit} disabled={working || !hasSignature || !password || !consent}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Verify and apply NAL signature</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
