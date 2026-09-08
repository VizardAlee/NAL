'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, FileImage, FileText, Loader2, Plus, Save, ShieldCheck, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useFirebaseApp, useUser } from '@/firebase';
import { uploadAuthenticatedFile } from '@/firebase/storage-upload';
import { useToast } from '@/hooks/use-toast';
import type { HistoricalDealDraft, HistoricalExtraction, HistoricalFundPosition, ReconciliationIssue } from '@/lib/historical-import';
import { analyzeHistoricalImportAction, getHistoricalDocumentPreviewAction, getHistoricalImportAction, getHistoricalImportWorkspaceAction, postHistoricalImportAction, registerHistoricalDocumentAction, saveHistoricalExtractionAction, setHistoricalDocumentVisibilityAction } from '../actions';

type ImportCase = Record<string, any> & { id: string; partyName: string; partyKind: string; status: string; asOfDate: string; documents: Array<Record<string, any>> };
type Workspace = Awaited<ReturnType<typeof getHistoricalImportWorkspaceAction>>;
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const emptyExtraction = (name = ''): HistoricalExtraction => ({ party: { name, accountType: 'Individual' }, deals: [], fundPositions: [], expenses: [], notes: [], confidence: 1 });
const numberValue = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

function Step({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return <div className="flex min-w-0 items-center gap-2"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? '✓' : number}</div><span className={`hidden text-xs sm:inline ${active ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span></div>;
}

function AccountSelect({ value, onChange, users, persona, placeholder, allowSelf = true }: { value?: string; onChange: (value: string) => void; users: Workspace['users']; persona: 'CLIENT' | 'INVESTOR'; placeholder: string; allowSelf?: boolean }) {
  const options = users.filter((user) => user.role.toUpperCase() === persona || user.personas.includes(persona));
  return <Select value={value || 'unlinked'} onValueChange={(next) => onChange(next === 'unlinked' ? '' : next)}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectItem value="unlinked">Not linked yet</SelectItem>{allowSelf && <SelectItem value="SELF">This imported account</SelectItem>}{persona === 'INVESTOR' && <SelectItem value="platform">NAL platform capital</SelectItem>}{options.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}</SelectItem>)}</SelectContent></Select>;
}

export default function HistoricalImportCasePage() {
  const { importId } = useParams<{ importId: string }>();
  const router = useRouter();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [record, setRecord] = useState<ImportCase | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [extraction, setExtraction] = useState<HistoricalExtraction | null>(null);
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getRequiredIdToken();
      const [caseResult, workspaceResult] = await Promise.all([getHistoricalImportAction(token, importId), getHistoricalImportWorkspaceAction(token)]);
      if (!caseResult.success) throw new Error(caseResult.message);
      setRecord(caseResult.importCase as ImportCase); setWorkspace(workspaceResult);
      const saved = (caseResult.importCase as any).extraction as HistoricalExtraction | null;
      setExtraction(saved || emptyExtraction((caseResult.importCase as any).partyName));
      setIssues(((caseResult.importCase as any).reconciliationIssues || []) as ReconciliationIssue[]);
    } catch (error) { toast({ variant: 'destructive', title: 'Import case unavailable', description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setLoading(false); }
  }, [importId, toast]);
  useEffect(() => { void refresh(); }, [refresh]);

  const posted = (record as any)?.status === 'POSTED';
  const step = posted ? 5 : !record?.documents?.length ? 1 : !(record as any).extraction ? 2 : issues.some((item) => item.severity === 'ERROR') ? 3 : 4;
  const progress = [0, 18, 42, 68, 88, 100][step];
  const errors = issues.filter((issue) => issue.severity === 'ERROR');

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !record || !user?.uid) return;
    setUploading(true);
    try {
      const token = await getRequiredIdToken();
      for (const file of Array.from(files)) {
        const uploaded = await uploadAuthenticatedFile(app, file, ['historical-imports', importId, user.uid], acceptedTypes, false);
        await registerHistoricalDocumentAction({ authToken: token, importId, storagePath: uploaded.fullPath, originalName: file.name, contentType: file.type, size: file.size });
      }
      toast({ title: 'Documents uploaded', description: `${files.length} file(s) added to the evidence set.` });
      await refresh();
    } catch (error) { toast({ variant: 'destructive', title: 'Upload failed', description: error instanceof Error ? error.message : 'Check the files and try again.' }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const analyze = () => startTransition(async () => {
    try { const result = await analyzeHistoricalImportAction(await getRequiredIdToken(), importId); setExtraction(result.extraction); setIssues(result.issues); toast({ title: 'Extraction ready', description: 'Review highlighted reconciliation issues before posting.' }); await refresh(); }
    catch (error) { toast({ variant: 'destructive', title: 'Extraction failed', description: error instanceof Error ? error.message : 'Gemini could not process this evidence set.' }); }
  });

  const previewDocument = async (documentId: string) => {
    try {
      const result = await getHistoricalDocumentPreviewAction({ authToken: await getRequiredIdToken(), importId, documentId });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) { toast({ variant: 'destructive', title: 'Preview unavailable', description: error instanceof Error ? error.message : 'Try again.' }); }
  };

  const changeDocumentVisibility = async (documentId: string, customerVisible: boolean) => {
    try { await setHistoricalDocumentVisibilityAction({ authToken: await getRequiredIdToken(), importId, documentId, customerVisible }); await refresh(); }
    catch (error) { toast({ variant: 'destructive', title: 'Sharing preference not saved', description: error instanceof Error ? error.message : 'Try again.' }); }
  };

  const save = () => startTransition(async () => {
    if (!extraction) return;
    try { const result = await saveHistoricalExtractionAction({ authToken: await getRequiredIdToken(), importId, extraction }); setIssues(result.issues); toast({ title: 'Review saved', description: result.issues.some((item) => item.severity === 'ERROR') ? 'Resolve the remaining red issues.' : 'The case is reconciled and ready to post.' }); await refresh(); }
    catch (error) { toast({ variant: 'destructive', title: 'Review not saved', description: error instanceof Error ? error.message : 'Try again.' }); }
  });

  const post = () => startTransition(async () => {
    try { const result = await postHistoricalImportAction(await getRequiredIdToken(), importId); setConfirmOpen(false); toast({ title: 'Historical records posted', description: result.message }); await refresh(); }
    catch (error) { toast({ variant: 'destructive', title: 'Posting blocked', description: error instanceof Error ? error.message : 'Review the case and try again.' }); }
  });

  const updateDeal = (index: number, patch: Partial<HistoricalDealDraft>) => setExtraction((current) => current ? ({ ...current, deals: current.deals.map((deal, dealIndex) => dealIndex === index ? { ...deal, ...patch } : deal) }) : current);
  const updateFund = (index: number, patch: Partial<HistoricalFundPosition>) => setExtraction((current) => current ? ({ ...current, fundPositions: current.fundPositions.map((position, positionIndex) => positionIndex === index ? { ...position, ...patch } : position) }) : current);

  if (loading || !record || !extraction || !workspace) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return <div className="space-y-6 pb-16">
    <Button variant="ghost" onClick={() => router.push('/admin/historical-imports')}><ArrowLeft className="mr-2 h-4 w-4" />Back to migration cases</Button>
    <PageHeader title={record.partyName as string} description={`Historical ${String(record.partyKind).toLowerCase()} records accurate as of ${new Date(record.asOfDate as string).toLocaleDateString('en-NG')}.`} icon={UploadCloud}>
      <Badge className={posted ? 'bg-emerald-600' : errors.length ? 'bg-red-600' : 'bg-amber-600'}>{String(record.status).replaceAll('_', ' ')}</Badge>
    </PageHeader>
    <Card><CardContent className="pt-6"><div className="flex items-center justify-between gap-2"><Step number={1} label="Evidence" active={step === 1} done={step > 1} /><Separator className="flex-1" /><Step number={2} label="Extract" active={step === 2} done={step > 2} /><Separator className="flex-1" /><Step number={3} label="Review" active={step === 3} done={step > 3} /><Separator className="flex-1" /><Step number={4} label="Reconcile" active={step === 4} done={step > 4} /><Separator className="flex-1" /><Step number={5} label="Posted" active={step === 5} done={step === 5} /></div><Progress value={progress} className="mt-5 h-2" /></CardContent></Card>
    {posted && <Alert className="border-emerald-300 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><AlertTitle>Migration posted and locked</AlertTitle><AlertDescription>The source documents and accepted values remain available for audit. Financial corrections must be recorded as traceable adjustments.</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />1. Evidence</CardTitle><CardDescription>Upload clear, complete photographs or PDFs. Agreements, receipts, schedules, statements and invoices may be added together.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><input ref={fileRef} className="hidden" type="file" multiple accept={acceptedTypes.join(',')} onChange={(event) => void uploadFiles(event.target.files)} /><Button variant="outline" onClick={() => fileRef.current?.click()} disabled={posted || uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add documents</Button>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{record.documents?.map((document: any) => <div key={document.id} className="rounded-lg border p-3"><div className="flex items-center gap-3">{document.contentType === 'application/pdf' ? <FileText className="h-8 w-8 text-red-600" /> : <FileImage className="h-8 w-8 text-blue-600" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.originalName}</p><p className="text-xs text-muted-foreground">{(document.size / 1024 / 1024).toFixed(2)} MB</p></div><Button size="sm" variant="ghost" onClick={() => void previewDocument(document.id)}>Preview</Button></div><label className="mt-3 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground"><Checkbox disabled={posted} checked={document.customerVisible === true} onCheckedChange={(checked) => void changeDocumentVisibility(document.id, checked === true)} />Share this document with the customer after posting</label></div>)}</div>
        {!record.documents?.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No documents uploaded yet.</div>}
        <Button onClick={analyze} disabled={posted || pending || !record.documents?.length}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}{(record as any).extraction ? 'Re-run extraction' : 'Extract records with Gemini'}</Button>
      </CardContent>
    </Card>
    {(record as any).extraction && <>
      <Card><CardHeader><CardTitle>2. Customer identity</CardTitle><CardDescription>{record.partyMode === 'EXISTING' ? 'This evidence is attached to the selected existing account.' : 'This profile will remain unclaimed until an administrator sends its invitation.'}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Name"><Input disabled={posted} value={extraction.party.name} onChange={(event) => setExtraction({ ...extraction, party: { ...extraction.party, name: event.target.value } })} /></Field><Field label="Email for later invitation"><Input disabled={posted} type="email" value={extraction.party.email || ''} onChange={(event) => setExtraction({ ...extraction, party: { ...extraction.party, email: event.target.value } })} /></Field><Field label="Phone"><Input disabled={posted} value={extraction.party.phoneNumber || ''} onChange={(event) => setExtraction({ ...extraction, party: { ...extraction.party, phoneNumber: event.target.value } })} /></Field><Field label="Address"><Input disabled={posted} value={extraction.party.address || ''} onChange={(event) => setExtraction({ ...extraction, party: { ...extraction.party, address: event.target.value } })} /></Field></CardContent></Card>
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>3. Deals</CardTitle><CardDescription>Confirm whether every deal is ongoing or completed. Ongoing deals retain only their remaining operational schedule.</CardDescription></div><Button variant="outline" size="sm" disabled={posted} onClick={() => setExtraction({ ...extraction, deals: [...extraction.deals, { id: `deal-${extraction.deals.length + 1}`, dealName: '', clientName: extraction.party.name, state: 'ONGOING', financingMode: 'Murabaha', principal: 0, profitRate: 0, managementFeeAmount: 0, startDate: '', durationValue: 1, durationUnit: 'Months', repaymentFrequency: 'Monthly', amountPaid: 0, documentedOutstanding: 0, investors: [] }] })}><Plus className="mr-2 h-4 w-4" />Add deal</Button></CardHeader><CardContent className="space-y-5">{extraction.deals.map((deal, index) => <div key={deal.id || index} className="rounded-xl border p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Deal {index + 1}</h3><Select disabled={posted} value={deal.state} onValueChange={(value: 'ONGOING' | 'COMPLETED') => updateDeal(index, { state: value })}><SelectTrigger className={`w-44 ${deal.state === 'COMPLETED' ? 'border-emerald-400' : 'border-blue-400'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ONGOING">Ongoing</SelectItem><SelectItem value="COMPLETED">Completed</SelectItem></SelectContent></Select></div><div className="grid gap-4 md:grid-cols-3"><Field label="Deal name"><Input disabled={posted} value={deal.dealName} onChange={(event) => updateDeal(index, { dealName: event.target.value })} /></Field><Field label="Financing mode"><Select disabled={posted} value={deal.financingMode} onValueChange={(value: any) => updateDeal(index, { financingMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Murabaha">Murabaha</SelectItem><SelectItem value="Ijara">Ijara</SelectItem><SelectItem value="Mudaraba">Mudaraba</SelectItem></SelectContent></Select></Field><Field label="Existing client account"><AccountSelect value={deal.clientId} onChange={(value) => updateDeal(index, { clientId: value })} users={workspace.users} persona="CLIENT" placeholder="Link client" /></Field><Field label="Principal"><Input disabled={posted} type="number" step="0.01" value={deal.principal} onChange={(event) => updateDeal(index, { principal: numberValue(event.target.value) })} /></Field><Field label="Profit rate (%)"><Input disabled={posted} type="number" step="0.01" value={deal.profitRate} onChange={(event) => updateDeal(index, { profitRate: numberValue(event.target.value) })} /></Field><Field label="Amount paid"><Input disabled={posted} type="number" step="0.01" value={deal.amountPaid} onChange={(event) => updateDeal(index, { amountPaid: numberValue(event.target.value) })} /></Field><Field label="Documented outstanding"><Input disabled={posted} type="number" step="0.01" value={deal.documentedOutstanding} onChange={(event) => updateDeal(index, { documentedOutstanding: numberValue(event.target.value) })} /></Field><Field label="Start date"><Input disabled={posted} type="date" value={deal.startDate} onChange={(event) => updateDeal(index, { startDate: event.target.value })} /></Field>{deal.state === 'COMPLETED' && <Field label="Completion date"><Input disabled={posted} type="date" value={deal.completionDate || ''} onChange={(event) => updateDeal(index, { completionDate: event.target.value })} /></Field>}<Field label="Duration"><div className="flex gap-2"><Input disabled={posted} className="w-24" type="number" value={deal.durationValue} onChange={(event) => updateDeal(index, { durationValue: numberValue(event.target.value) })} /><Select disabled={posted} value={deal.durationUnit} onValueChange={(value: any) => updateDeal(index, { durationUnit: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Days','Weeks','Fortnights','Months','Years'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></Field><Field label="Repayment frequency"><Select disabled={posted} value={deal.repaymentFrequency} onValueChange={(value: any) => updateDeal(index, { repaymentFrequency: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Daily','Weekly','Fortnightly','Monthly'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field></div>
          <Separator className="my-4" /><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Investor allocations</p><Button size="sm" variant="ghost" disabled={posted} onClick={() => updateDeal(index, { investors: [...deal.investors, { investorName: extraction.party.name, amountInvested: 0, realisedProfit: 0, principalReturned: 0 }] })}><Plus className="mr-1 h-3 w-3" />Add investor</Button></div>{deal.investors.map((investor, investorIndex) => <div key={investorIndex} className="mb-3 grid gap-3 rounded-lg bg-muted/40 p-3 md:grid-cols-4"><Field label="Investor account"><AccountSelect value={investor.investorId} onChange={(value) => updateDeal(index, { investors: deal.investors.map((item, itemIndex) => itemIndex === investorIndex ? { ...item, investorId: value } : item) })} users={workspace.users} persona="INVESTOR" placeholder="Link investor" /></Field><Field label="Investor name"><Input disabled={posted} value={investor.investorName} onChange={(event) => updateDeal(index, { investors: deal.investors.map((item, itemIndex) => itemIndex === investorIndex ? { ...item, investorName: event.target.value } : item) })} /></Field><Field label="Amount invested"><Input disabled={posted} type="number" step="0.01" value={investor.amountInvested} onChange={(event) => updateDeal(index, { investors: deal.investors.map((item, itemIndex) => itemIndex === investorIndex ? { ...item, amountInvested: numberValue(event.target.value) } : item) })} /></Field><Field label="Realised profit"><Input disabled={posted} type="number" step="0.01" value={investor.realisedProfit} onChange={(event) => updateDeal(index, { investors: deal.investors.map((item, itemIndex) => itemIndex === investorIndex ? { ...item, realisedProfit: numberValue(event.target.value) } : item) })} /></Field></div>)}</div>)}{!extraction.deals.length && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No deal was detected. Add one manually if the evidence contains a deal.</p>}</CardContent></Card>
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>4. Investor fund positions</CardTitle><CardDescription>Use actual reconciled deposits, allocations, withdrawals and available capital as at the import date.</CardDescription></div><Button variant="outline" size="sm" disabled={posted} onClick={() => setExtraction({ ...extraction, fundPositions: [...extraction.fundPositions, { investorName: extraction.party.name, totalDeposited: 0, totalAllocated: 0, totalWithdrawn: 0, principalReturned: 0, realisedProfit: 0, availableCapital: 0 }] })}><Plus className="mr-2 h-4 w-4" />Add position</Button></CardHeader><CardContent className="space-y-4">{extraction.fundPositions.map((position, index) => <div key={index} className="grid gap-3 rounded-xl border p-4 md:grid-cols-4"><Field label="Investor account"><AccountSelect value={position.investorId} onChange={(value) => updateFund(index, { investorId: value })} users={workspace.users} persona="INVESTOR" placeholder="Link investor" /></Field><Field label="Investor name"><Input disabled={posted} value={position.investorName} onChange={(event) => updateFund(index, { investorName: event.target.value })} /></Field><Field label="Total deposited"><Input disabled={posted} type="number" step="0.01" value={position.totalDeposited} onChange={(event) => updateFund(index, { totalDeposited: numberValue(event.target.value) })} /></Field><Field label="Allocated to deals"><Input disabled={posted} type="number" step="0.01" value={position.totalAllocated} onChange={(event) => updateFund(index, { totalAllocated: numberValue(event.target.value) })} /></Field><Field label="Withdrawn"><Input disabled={posted} type="number" step="0.01" value={position.totalWithdrawn} onChange={(event) => updateFund(index, { totalWithdrawn: numberValue(event.target.value) })} /></Field><Field label="Principal returned"><Input disabled={posted} type="number" step="0.01" value={position.principalReturned} onChange={(event) => updateFund(index, { principalReturned: numberValue(event.target.value) })} /></Field><Field label="Realised profit"><Input disabled={posted} type="number" step="0.01" value={position.realisedProfit} onChange={(event) => updateFund(index, { realisedProfit: numberValue(event.target.value) })} /></Field><Field label="Available capital"><Input disabled={posted} type="number" step="0.01" value={position.availableCapital} onChange={(event) => updateFund(index, { availableCapital: numberValue(event.target.value) })} /></Field></div>)}</CardContent></Card>
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>5. Historical expenses</CardTitle><CardDescription>Record only documented business spending. These values affect administrative reporting, not investor capital unless the source evidence says so.</CardDescription></div><Button variant="outline" size="sm" disabled={posted} onClick={() => setExtraction({ ...extraction, expenses: [...extraction.expenses, { description: '', amount: 0 }] })}><Plus className="mr-2 h-4 w-4" />Add expense</Button></CardHeader><CardContent className="space-y-3">{extraction.expenses.map((expense, index) => <div key={index} className="grid gap-3 rounded-xl border p-4 md:grid-cols-4"><Field label="Description"><Input disabled={posted} value={expense.description} onChange={(event) => setExtraction({ ...extraction, expenses: extraction.expenses.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} /></Field><Field label="Amount spent"><Input disabled={posted} type="number" step="0.01" value={expense.amount} onChange={(event) => setExtraction({ ...extraction, expenses: extraction.expenses.map((item, itemIndex) => itemIndex === index ? { ...item, amount: numberValue(event.target.value) } : item) })} /></Field><Field label="Date"><Input disabled={posted} type="date" value={expense.date || ''} onChange={(event) => setExtraction({ ...extraction, expenses: extraction.expenses.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item) })} /></Field><Field label="Reference"><Input disabled={posted} value={expense.reference || ''} onChange={(event) => setExtraction({ ...extraction, expenses: extraction.expenses.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item) })} /></Field></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>6. Reconciliation and posting</CardTitle><CardDescription>Save the review to recalculate every check. Red issues block posting; amber warnings require attention but may be accepted.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Extraction confidence</p><p className="text-2xl font-semibold">{Math.round(extraction.confidence * 100)}%</p></div><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Reconciliation</p><p className={`text-2xl font-semibold ${errors.length ? 'text-red-600' : 'text-emerald-700'}`}>{errors.length ? `${errors.length} blocking issue(s)` : 'Balanced'}</p></div></div>
        {issues.map((issue, index) => <Alert key={`${issue.code}-${index}`} variant={issue.severity === 'ERROR' ? 'destructive' : 'default'}><AlertCircle className="h-4 w-4" /><AlertTitle>{issue.severity === 'ERROR' ? 'Must resolve' : 'Review recommended'}</AlertTitle><AlertDescription>{issue.message}</AlertDescription></Alert>)}
        <Field label="Extraction notes"><Textarea disabled={posted} rows={5} value={extraction.notes.join('\n')} onChange={(event) => setExtraction({ ...extraction, notes: event.target.value.split('\n').filter(Boolean) })} /></Field>
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={save} disabled={posted || pending}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save and reconcile</Button><Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogTrigger asChild><Button disabled={posted || pending || errors.length > 0}><ShieldCheck className="mr-2 h-4 w-4" />Approve and post</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Post these historical records?</DialogTitle><DialogDescription>This creates live financial records. The import becomes immutable and later corrections must use audited adjustments.</DialogDescription></DialogHeader><div className="rounded-lg bg-muted p-4 text-sm"><p><strong>{extraction.deals.length}</strong> deal(s)</p><p><strong>{extraction.fundPositions.length}</strong> investor fund position(s)</p><p><strong>{record.documents?.length || 0}</strong> source document(s)</p></div><DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button onClick={post} disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Post historical records</Button></DialogFooter></DialogContent></Dialog></div>
      </CardContent></Card>
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid min-w-0 gap-1.5"><Label>{label}</Label>{children}</div>; }
