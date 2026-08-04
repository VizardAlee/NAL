'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { collection, orderBy, query, Timestamp, where, type DocumentData } from 'firebase/firestore';
import { getBlob, getStorage, ref } from 'firebase/storage';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle, Archive, CheckCircle2, Download, FileDown, FileText, Gavel,
  Loader2, MessageCircle, Paperclip, Phone, Printer, Scale, Search, Send,
  ShieldAlert, UserCheck, Users,
} from 'lucide-react';
import { useCollection, useFirebaseApp, useFirestore, useUser } from '@/firebase';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { uploadAuthenticatedFile } from '@/firebase/storage-upload';
import { canWriteAdmin } from '@/lib/access-control';
import {
  CONTACT_CHANNELS, LEGAL_STATUSES, RECOVERY_OUTCOMES, canTransitionRecoveryStatus,
  recoveryStatusLabel, type ContactChannel, type RecoveryOutcome,
} from '@/lib/recovery';
import {
  assignRecoveryCaseAction, claimRecoveryCaseAction, createDemandNoticeAction, downloadCaseAgreementAction,
  escalateRecoveryCaseAction, listCaseAgreementsAction, recordRecoveryContactAction,
  issueDemandNoticeAction, listOperationalOfficersAction, registerCaseEvidenceAction,
  resolveLegalCaseAction, updateLegalCaseAction,
} from '@/app/recovery/dashboard/actions';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const RECOVERY_QUEUE = ['UPCOMING', 'DUE', 'OVERDUE', 'PROMISE_TO_PAY', 'BROKEN_PROMISE', 'Due_Recovery'];
const LEGAL_QUEUE = [...LEGAL_STATUSES, 'Escalated_Legal'];
const PAGE_SIZE = 12;
const ACCEPTED_EVIDENCE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type CaseRecord = DocumentData & {
  id: string; clientId: string; clientName: string; clientEmail?: string; clientPhoneNumber?: string; clientAddress?: string;
  dealId: string; dealName: string; financingMode?: string; repaymentId: string; installmentNumber?: number;
  scheduledAmount?: number; amountPaid?: number; amountOutstanding?: number; amountDue?: number; dueDate: Timestamp;
  daysPastDue?: number; status: string; assigneeId?: string | null; assigneeName?: string | null;
  nextActionAt?: Timestamp | null; promiseAmount?: number; promiseDueAt?: Timestamp; lastLog?: string;
  externalCounsel?: string; courtReference?: string; hearingAt?: Timestamp; settlementAmount?: number;
  settlementTerms?: string; totalLegalExpenses?: number; escalationReason?: string;
  guarantor?: { name?: string; address?: string; phoneNumber?: string; occupation?: string; photoURL?: string };
  createdAt?: Timestamp; updatedAt?: Timestamp;
};

type CaseLog = DocumentData & { id: string; kind?: string; text: string; authorName: string; createdAt?: Timestamp };
type Evidence = DocumentData & { id: string; fileName: string; storagePath: string; category: string; uploadedByName: string; createdAt?: Timestamp };
type Agreement = { id: string; agreementType: string; agreementReference: string; status: string; archived: boolean };
type Officer = { id: string; name: string };

function money(value?: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value || 0));
}

function dateTimeLocal(date?: Date) {
  if (!date) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function statusClass(status: string) {
  if (['UPCOMING', 'DUE'].includes(status)) return 'border-amber-300 bg-amber-50 text-amber-800';
  if (['OVERDUE', 'BROKEN_PROMISE', 'Due_Recovery'].includes(status)) return 'border-red-300 bg-red-50 text-red-800';
  if (['PROMISE_TO_PAY', 'NEGOTIATION', 'SETTLED'].includes(status)) return 'border-blue-300 bg-blue-50 text-blue-800';
  return 'border-purple-300 bg-purple-50 text-purple-800';
}

function downloadCsv(cases: CaseRecord[], portal: 'recovery' | 'legal') {
  const rows = [
    ['Client', 'Deal', 'Installment', 'Due date', 'Scheduled', 'Paid', 'Outstanding', 'Status', 'Officer', 'Next action'],
    ...cases.map((item) => [item.clientName, item.dealName, item.installmentNumber || '', item.dueDate?.toDate?.().toISOString() || '', item.scheduledAmount || '', item.amountPaid || '', item.amountOutstanding ?? item.amountDue ?? '', recoveryStatusLabel(item.status), item.assigneeName || 'Unassigned', item.nextActionAt?.toDate?.().toISOString() || '']),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nal-${portal}-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function EvidenceUploader({ task, onUploaded }: { task: CaseRecord; onUploaded: () => void }) {
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const upload = (file?: File) => {
    if (!file || !user) return;
    startTransition(async () => {
      try {
        const uploaded = await uploadAuthenticatedFile(app, file, ['case-evidence', task.id, user.uid], ACCEPTED_EVIDENCE, false);
        const result = await registerCaseEvidenceAction({ authToken: await getRequiredIdToken(), taskId: task.id, fileName: file.name, storagePath: uploaded.fullPath, contentType: file.type as never, size: file.size, category: 'OTHER' });
        toast({ variant: result.success ? 'default' : 'destructive', title: result.success ? 'Evidence added' : 'Upload failed', description: result.message });
        if (result.success) onUploaded();
      } catch (error) {
        toast({ variant: 'destructive', title: 'Upload failed', description: error instanceof Error ? error.message : 'Unable to upload evidence.' });
      } finally {
        if (inputRef.current) inputRef.current.value = '';
      }
    });
  };
  return <><Input ref={inputRef} className="hidden" type="file" accept={ACCEPTED_EVIDENCE.join(',')} onChange={(event) => upload(event.target.files?.[0])} /><Button variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />} Add evidence</Button></>;
}

function CaseSheet({ portal, task, onClose }: { portal: 'recovery' | 'legal'; task: CaseRecord; onClose: () => void }) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [refresh, setRefresh] = useState(0);
  const [channel, setChannel] = useState<ContactChannel>('PHONE');
  const [outcome, setOutcome] = useState<RecoveryOutcome>('CONTACTED');
  const [notes, setNotes] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseDueAt, setPromiseDueAt] = useState('');
  const [escalationReason, setEscalationReason] = useState('Recovery attempts have not produced payment or a sustainable arrangement.');
  const [legalStatus, setLegalStatus] = useState('NOTICE_PREPARATION');
  const [counsel, setCounsel] = useState(task.externalCounsel || '');
  const [courtReference, setCourtReference] = useState(task.courtReference || '');
  const [hearingAt, setHearingAt] = useState(dateTimeLocal(task.hearingAt?.toDate?.()));
  const [settlementAmount, setSettlementAmount] = useState(task.settlementAmount ? String(task.settlementAmount) : '');
  const [settlementTerms, setSettlementTerms] = useState(task.settlementTerms || '');
  const [legalExpense, setLegalExpense] = useState('');
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [noticePreview, setNoticePreview] = useState('');
  const [noticeId, setNoticeId] = useState('');
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [assignment, setAssignment] = useState(task.assigneeId || 'UNASSIGNED');

  const logsQuery = useMemo(() => firestore ? query(collection(firestore, `recoveryTasks/${task.id}/logs`), orderBy('createdAt', 'desc')) : null, [firestore, task.id]);
  const evidenceQuery = useMemo(() => firestore ? query(collection(firestore, `recoveryTasks/${task.id}/evidence`), orderBy('createdAt', 'desc')) : null, [firestore, task.id]);
  const { data: logs, loading: logsLoading } = useCollection<CaseLog>(logsQuery);
  const { data: evidence } = useCollection<Evidence>(evidenceQuery);

  const legalOptions = useMemo(() => LEGAL_STATUSES.filter((status) => status !== task.status && (canWriteAdmin(user) || canTransitionRecoveryStatus(task.status, status, 'LEGAL'))), [task.status, user]);
  useEffect(() => { if (legalOptions[0]) setLegalStatus(legalOptions[0]); }, [legalOptions]);
  useEffect(() => {
    if (portal !== 'legal') return;
    void (async () => {
      const result = await listCaseAgreementsAction({ authToken: await getRequiredIdToken(), taskId: task.id });
      if (result.success) setAgreements(result.agreements as Agreement[]);
    })();
  }, [portal, task.id, refresh]);
  useEffect(() => {
    if (!canWriteAdmin(user)) return;
    void (async () => {
      const result = await listOperationalOfficersAction({ authToken: await getRequiredIdToken(), portal });
      if (result.success) setOfficers(result.officers);
    })();
  }, [portal, user]);

  const execute = (work: () => Promise<{ success: boolean; message: string }>, success?: () => void) => startTransition(async () => {
    try {
      const result = await work();
      toast({ variant: result.success ? 'default' : 'destructive', title: result.success ? 'Case updated' : 'Action failed', description: result.message });
      if (result.success) { setRefresh((value) => value + 1); success?.(); }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Action failed', description: error instanceof Error ? error.message : 'Unable to update the case.' });
    }
  });

  const printNotice = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    popup.document.write(`<html><head><title>NAL demand notice</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:50px auto;line-height:1.7;white-space:pre-wrap}h1{color:#0b593f}.notice{border-top:4px solid #0b593f;padding-top:24px}</style></head><body><h1>NAL GENERAL MERCHANT LIMITED</h1><div class="notice">${noticePreview.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div><script>window.print()</script></body></html>`);
    popup.document.close();
  };

  const downloadAgreement = (agreement: Agreement) => execute(async () => {
    const result = await downloadCaseAgreementAction({ authToken: await getRequiredIdToken(), taskId: task.id, envelopeId: agreement.id });
    if (result.success) {
      const bytes = Uint8Array.from(atob(result.pdfBase64), (value) => value.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; anchor.click(); URL.revokeObjectURL(url);
    }
    return result;
  });

  const openEvidence = async (file: Evidence) => {
    try {
      const blob = await getBlob(ref(getStorage(app), file.storagePath), 5 * 1024 * 1024);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Evidence unavailable', description: error instanceof Error ? error.message : 'Unable to open this evidence file.' });
    }
  };

  return <Sheet open onOpenChange={(open) => !open && onClose()}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl print:max-w-none">
    <SheetHeader className="border-b pb-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><SheetTitle>{task.clientName}</SheetTitle><SheetDescription>{task.dealName} · Instalment {task.installmentNumber || '—'}</SheetDescription></div><Badge variant="outline" className={statusClass(task.status)}>{recoveryStatusLabel(task.status)}</Badge></div></SheetHeader>
    <div className="space-y-6 py-5">
      <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Scheduled</p><p className="mt-1 font-bold">{money(task.scheduledAmount)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Approved payments</p><p className="mt-1 font-bold text-emerald-700">{money(task.amountPaid)}</p></CardContent></Card><Card className="border-red-200"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="mt-1 font-bold text-red-700">{money(task.amountOutstanding ?? task.amountDue)}</p></CardContent></Card></div>
      <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Client</CardTitle></CardHeader><CardContent className="space-y-1 text-sm"><p>{task.clientEmail || 'No email recorded'}</p><a className="flex items-center gap-2 text-primary" href={`tel:${task.clientPhoneNumber || ''}`}><Phone className="h-3.5 w-3.5" />{task.clientPhoneNumber || 'No phone recorded'}</a><p className="text-muted-foreground">{task.clientAddress || 'No address recorded'}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Guarantor</CardTitle></CardHeader><CardContent className="space-y-1 text-sm"><p className="font-medium">{task.guarantor?.name || 'Not recorded'}</p><p>{task.guarantor?.phoneNumber || 'No phone recorded'}</p><p className="text-muted-foreground">{task.guarantor?.address || 'No address recorded'}</p></CardContent></Card></div>
      <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Due date</p><p className="font-medium">{task.dueDate?.toDate ? format(task.dueDate.toDate(), 'PPP') : 'Unknown'}</p></div><div><p className="text-xs text-muted-foreground">Officer</p><p className="font-medium">{task.assigneeName || 'Unassigned'}</p></div><div><p className="text-xs text-muted-foreground">Next action</p><p className="font-medium">{task.nextActionAt?.toDate ? format(task.nextActionAt.toDate(), 'PPP p') : 'Not scheduled'}</p></div></div>
      {!task.assigneeId && <Button disabled={pending} onClick={() => execute(async () => claimRecoveryCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id }))}><UserCheck className="mr-2 h-4 w-4" /> Claim this case</Button>}
      {canWriteAdmin(user) && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Administrative assignment</CardTitle><CardDescription>Assign only to an officer in the team that owns the current stage.</CardDescription></CardHeader><CardContent className="flex gap-2"><Select value={assignment} onValueChange={setAssignment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UNASSIGNED">Unassigned queue</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.name}</SelectItem>)}</SelectContent></Select><Button disabled={pending || assignment === (task.assigneeId || 'UNASSIGNED')} onClick={() => execute(async () => assignRecoveryCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id, assigneeId: assignment === 'UNASSIGNED' ? null : assignment }))}>Assign</Button></CardContent></Card>}

      {portal === 'recovery' ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" /> Record recovery contact</CardTitle><CardDescription>Use structured outcomes so the next officer can continue the case accurately.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Channel</Label><Select value={channel} onValueChange={(value) => setChannel(value as ContactChannel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONTACT_CHANNELS.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div><div><Label>Outcome</Label><Select value={outcome} onValueChange={(value) => setOutcome(value as RecoveryOutcome)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECOVERY_OUTCOMES.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div></div><div><Label>Contact notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What happened, who was contacted and what was agreed?" /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Next follow-up</Label><Input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} /></div>{outcome === 'PROMISE_TO_PAY' && <><div><Label>Promised amount</Label><Input type="number" min="0.01" step="0.01" value={promiseAmount} onChange={(event) => setPromiseAmount(event.target.value)} /></div><div><Label>Promise due</Label><Input type="datetime-local" value={promiseDueAt} onChange={(event) => setPromiseDueAt(event.target.value)} /></div></>}</div><Button disabled={pending || !notes.trim()} onClick={() => execute(async () => recordRecoveryContactAction({ authToken: await getRequiredIdToken(), taskId: task.id, channel, outcome, notes, ...(nextActionAt ? { nextActionAt: new Date(nextActionAt).toISOString() } : {}), ...(promiseAmount ? { promiseAmount: Number(promiseAmount) } : {}), ...(promiseDueAt ? { promiseDueAt: new Date(promiseDueAt).toISOString() } : {}) }), () => setNotes(''))}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Save outcome</Button><div className="border-t pt-4"><Label>Escalation reason</Label><Textarea value={escalationReason} onChange={(event) => setEscalationReason(event.target.value)} /><Button className="mt-3" variant="destructive" disabled={pending || !escalationReason.trim()} onClick={() => execute(async () => escalateRecoveryCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id, reason: escalationReason }), onClose)}><Gavel className="mr-2 h-4 w-4" /> Escalate complete case to Legal</Button></div></CardContent></Card> : <>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Legal case action</CardTitle><CardDescription>Record every material step, deadline, cost, settlement term and court reference.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label>Next case stage</Label><Select value={legalStatus} onValueChange={setLegalStatus}><SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger><SelectContent>{legalOptions.map((status) => <SelectItem key={status} value={status}>{recoveryStatusLabel(status)}</SelectItem>)}</SelectContent></Select></div><div><Label>Action notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Action taken, persons involved, response and next legal step" /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Next action</Label><Input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} /></div><div><Label>External counsel</Label><Input value={counsel} onChange={(event) => setCounsel(event.target.value)} /></div><div><Label>Court/reference number</Label><Input value={courtReference} onChange={(event) => setCourtReference(event.target.value)} /></div><div><Label>Hearing/deadline</Label><Input type="datetime-local" value={hearingAt} onChange={(event) => setHearingAt(event.target.value)} /></div><div><Label>Settlement amount</Label><Input type="number" min="0" step="0.01" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} /></div><div><Label>Legal expense</Label><Input type="number" min="0" step="0.01" value={legalExpense} onChange={(event) => setLegalExpense(event.target.value)} /></div></div><div><Label>Settlement terms</Label><Textarea value={settlementTerms} onChange={(event) => setSettlementTerms(event.target.value)} /></div><Button disabled={pending || !notes.trim() || !legalStatus} onClick={() => execute(async () => updateLegalCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id, nextStatus: legalStatus as never, notes, ...(nextActionAt ? { nextActionAt: new Date(nextActionAt).toISOString() } : {}), externalCounsel: counsel, courtReference, ...(hearingAt ? { hearingAt: new Date(hearingAt).toISOString() } : {}), ...(settlementAmount ? { settlementAmount: Number(settlementAmount) } : {}), settlementTerms, ...(legalExpense ? { legalExpense: Number(legalExpense) } : {}) }), () => { setNotes(''); setLegalExpense(''); })}><Gavel className="mr-2 h-4 w-4" /> Save Legal action</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Demand notice</CardTitle><CardDescription>A draft cannot be served until an authorised Legal officer explicitly reviews and issues it.</CardDescription></CardHeader><CardContent className="space-y-3"><Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await createDemandNoticeAction({ authToken: await getRequiredIdToken(), taskId: task.id, responseDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString() }); if (result.success && result.notice) { setNoticePreview(result.notice.content); setNoticeId(result.notice.id); } toast({ variant: result.success ? 'default' : 'destructive', title: result.success ? 'Draft prepared' : 'Unable to prepare notice', description: result.message }); })}><FileText className="mr-2 h-4 w-4" /> Prepare seven-day demand</Button>{noticePreview && <div className="space-y-3"><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border bg-white p-4 text-xs text-slate-900">{noticePreview}</pre><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={printNotice}><Printer className="mr-2 h-4 w-4" /> Print draft</Button><Button disabled={pending || !noticeId} onClick={() => execute(async () => issueDemandNoticeAction({ authToken: await getRequiredIdToken(), taskId: task.id, noticeId, confirmedReviewed: true }), () => setNoticeId(''))}><CheckCircle2 className="mr-2 h-4 w-4" /> Review and issue</Button></div></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Signed agreements</CardTitle></CardHeader><CardContent className="space-y-2">{agreements.length ? agreements.map((agreement) => <div key={agreement.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{agreement.agreementReference}</p><p className="text-xs text-muted-foreground">{agreement.agreementType} · {agreement.status}</p></div><Button size="sm" variant="outline" disabled={!agreement.archived || pending} onClick={() => downloadAgreement(agreement)}><Download className="mr-2 h-4 w-4" /> Signed PDF</Button></div>) : <p className="text-sm text-muted-foreground">No deal agreements were found for this case.</p>}</CardContent></Card>
        <Card className="border-emerald-200"><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Resolve and archive</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || Number(task.amountOutstanding || 0) > 0} onClick={() => execute(async () => resolveLegalCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id, resolutionReason: 'PAYMENT_COMPLETED', notes: 'The recorded outstanding balance has been paid in full.' }), onClose)}>Close as fully paid</Button><Button variant="outline" disabled={pending || !notes.trim()} onClick={() => execute(async () => resolveLegalCaseAction({ authToken: await getRequiredIdToken(), taskId: task.id, resolutionReason: 'SETTLEMENT_COMPLETED', notes }), onClose)}>Close as settled</Button></CardContent></Card>
      </>}

      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Case evidence</CardTitle><CardDescription>PDF, JPG, PNG or WebP; maximum 5 MB. Files remain access-controlled.</CardDescription></div><EvidenceUploader task={task} onUploaded={() => setRefresh((value) => value + 1)} /></div></CardHeader><CardContent className="space-y-2">{evidence?.length ? evidence.map((file) => <button type="button" key={file.id} onClick={() => void openEvidence(file)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted"><span className="truncate text-sm">{file.fileName}</span><FileDown className="h-4 w-4" /></button>) : <p className="text-sm text-muted-foreground">No evidence uploaded.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Immutable case timeline</CardTitle></CardHeader><CardContent>{logsLoading ? <Skeleton className="h-24" /> : logs?.length ? <div className="space-y-4">{logs.map((log) => <div key={log.id} className="border-l-2 border-primary/25 pl-4"><div className="flex flex-wrap justify-between gap-2"><Badge variant="outline">{log.kind || 'NOTE'}</Badge><span className="text-xs text-muted-foreground">{log.createdAt?.toDate ? formatDistanceToNow(log.createdAt.toDate(), { addSuffix: true }) : 'Just now'}</span></div><p className="mt-2 text-sm">{log.text}</p><p className="mt-1 text-xs text-muted-foreground">{log.authorName}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No case history has been recorded.</p>}</CardContent></Card>
    </div>
  </SheetContent></Sheet>;
}

export function OperationalCasesDashboard({ portal }: { portal: 'recovery' | 'legal' }) {
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [ownership, setOwnership] = useState('ALL');
  const [page, setPage] = useState(1);
  const statuses = portal === 'recovery' ? RECOVERY_QUEUE : LEGAL_QUEUE;
  const isAdmin = canWriteAdmin(user);
  const allQuery = useMemo(() => firestore && user && isAdmin ? query(collection(firestore, 'recoveryTasks'), where('status', 'in', statuses), orderBy('dueDate', 'asc')) : null, [firestore, isAdmin, statuses, user]);
  const mineQuery = useMemo(() => firestore && user && !isAdmin ? query(collection(firestore, 'recoveryTasks'), where('status', 'in', statuses), where('assigneeId', '==', user.uid), orderBy('dueDate', 'asc')) : null, [firestore, isAdmin, statuses, user]);
  const unassignedQuery = useMemo(() => firestore && user && !isAdmin ? query(collection(firestore, 'recoveryTasks'), where('status', 'in', statuses), where('assigneeId', '==', null), orderBy('dueDate', 'asc')) : null, [firestore, isAdmin, statuses, user]);
  const all = useCollection<CaseRecord>(allQuery); const mine = useCollection<CaseRecord>(mineQuery); const unassigned = useCollection<CaseRecord>(unassignedQuery);
  const error = all.error || mine.error || unassigned.error;
  const cases = useMemo(() => Array.from(new Map([...(all.data || []), ...(mine.data || []), ...(unassigned.data || [])].map((item) => [item.id, item])).values()), [all.data, mine.data, unassigned.data]);
  const loading = userLoading || all.loading || mine.loading || unassigned.loading;
  useEffect(() => {
    if (!selected) return;
    const current = cases.find((item) => item.id === selected.id);
    if (current) setSelected(current);
    else if (!loading) setSelected(null);
  }, [cases, loading, selected]);
  const filtered = useMemo(() => cases.filter((item) => {
    const haystack = `${item.clientName} ${item.dealName} ${item.clientEmail || ''} ${item.clientPhoneNumber || ''}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (status !== 'ALL' && item.status !== status) return false;
    if (ownership === 'MINE' && item.assigneeId !== user?.uid) return false;
    if (ownership === 'UNASSIGNED' && item.assigneeId) return false;
    return true;
  }), [cases, ownership, search, status, user?.uid]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const overdueTotal = cases.reduce((sum, item) => sum + Number(item.amountOutstanding ?? item.amountDue ?? 0), 0);
  const dueActions = cases.filter((item) => item.nextActionAt?.toDate && item.nextActionAt.toDate() <= new Date()).length;

  return <div className="space-y-6"><PageHeader title={portal === 'recovery' ? 'Recovery Operations' : 'Legal Case Management'} description={portal === 'recovery' ? 'Own every follow-up from reminder through escalation.' : 'Manage escalated accounts, evidence, notices, proceedings and resolution.'} icon={portal === 'recovery' ? ShieldAlert : Gavel} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Open cases</p><p className="mt-1 text-3xl font-bold">{cases.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Outstanding</p><p className="mt-1 text-2xl font-bold text-red-700">{money(overdueTotal)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Due actions</p><p className="mt-1 text-3xl font-bold">{dueActions}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Unassigned</p><p className="mt-1 text-3xl font-bold">{cases.filter((item) => !item.assigneeId).length}</p></CardContent></Card></div>
    {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Cases could not be loaded</AlertTitle><AlertDescription>{error.message}. This is not an empty queue; retry after checking the connection and required Firestore index.</AlertDescription></Alert>}
    <Card><CardHeader><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle>{portal === 'recovery' ? 'Recovery queue' : 'Legal docket'}</CardTitle><CardDescription>{filtered.length} matching case(s), ordered by contractual due date.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadCsv(filtered, portal)} disabled={!filtered.length}><Download className="mr-2 h-4 w-4" /> Export CSV</Button><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print docket</Button></div></div><div className="grid gap-2 pt-3 md:grid-cols-[1fr_13rem_12rem]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search client, deal, email or phone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All stages</SelectItem>{statuses.map((value) => <SelectItem value={value} key={value}>{recoveryStatusLabel(value)}</SelectItem>)}</SelectContent></Select><Select value={ownership} onValueChange={(value) => { setOwnership(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All accessible</SelectItem><SelectItem value="MINE">Assigned to me</SelectItem><SelectItem value="UNASSIGNED">Unassigned</SelectItem></SelectContent></Select></div></CardHeader><CardContent>{loading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : !visible.length ? <div className="py-14 text-center"><Archive className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-medium">No matching open cases</p><p className="text-sm text-muted-foreground">Adjust the filters or wait for the next automation run.</p></div> : <div className="space-y-3">{visible.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="grid w-full gap-3 rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/40 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_auto] md:items-center"><div><p className="font-semibold">{item.clientName}</p><p className="text-sm text-muted-foreground">{item.dealName} · Instalment {item.installmentNumber || '—'}</p></div><div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-bold text-red-700">{money(item.amountOutstanding ?? item.amountDue)}</p></div><div><p className="text-xs text-muted-foreground">Due</p><p className="text-sm">{item.dueDate?.toDate ? format(item.dueDate.toDate(), 'PP') : 'Unknown'}</p></div><div><p className="text-xs text-muted-foreground">Officer</p><p className="truncate text-sm">{item.assigneeName || 'Unassigned'}</p></div><Badge variant="outline" className={statusClass(item.status)}>{recoveryStatusLabel(item.status)}</Badge></button>)}</div>}</CardContent></Card>
    {pageCount > 1 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span><Button variant="outline" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    {selected && <CaseSheet portal={portal} task={selected} onClose={() => setSelected(null)} />}
  </div>;
}
