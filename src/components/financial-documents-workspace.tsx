'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileCheck, Upload, Loader2, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { receiptPurposes, type ReceiptFields } from '@/lib/receipt-reconciliation';
import { listFinancialDocumentsAction, submitFinancialReceiptAction, confirmBankStatementAction, reconcileFinancialReceiptAction, postFinancialReceiptAction, rejectFinancialReceiptAction } from '@/app/common/actions/financial-document-actions';

const names: Record<string,string> = { REPAYMENT:'Client repayment', INVESTOR_CONTRIBUTION:'Investor contribution', MANAGEMENT_FEE:'Management fee', DISBURSEMENT:'NAL disbursement', PROCUREMENT:'Murabaha procurement', HISTORICAL_EVIDENCE:'Historical supporting evidence' };
const money = (value: number) => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(value || 0);
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
type Workspace = NonNullable<Extract<Awaited<ReturnType<typeof listFinancialDocumentsAction>>, {success:true}>['data']>;

export function FinancialDocumentsWorkspace({ portal }: { portal: 'admin'|'client'|'investor' }) {
  const { toast } = useToast();
  const [workspace,setWorkspace] = useState<Workspace|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [edit,setEdit] = useState<any>(null);
  const [fields,setFields] = useState<ReceiptFields>({amount:0,paymentDate:'',reference:'',sender:'',beneficiary:'',accountNumber:'',transferStatus:'UNKNOWN'});
  const [purpose,setPurpose] = useState(portal === 'investor' ? 'INVESTOR_CONTRIBUTION' : 'REPAYMENT');
  const [customerId,setCustomerId] = useState('');
  const [dealId,setDealId] = useState('');
  const [tenure,setTenure] = useState(90);
  const [rows,setRows] = useState<any[]>([]);
  const [statementEdit,setStatementEdit] = useState<any>(null);
  const [account,setAccount] = useState('');
  const [periodStart,setPeriodStart] = useState('');
  const [periodEnd,setPeriodEnd] = useState('');
  const [bankDate,setBankDate] = useState('');
  const [bankSelections,setBankSelections] = useState<Record<string,string>>({});
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('ALL');
  const [page,setPage] = useState(0);
  const [preview,setPreview] = useState<{url:string;type:string}|null>(null);
  const previewRef = useRef('');

  const refresh = useCallback(async () => {
    const result = await listFinancialDocumentsAction(await getRequiredIdToken(),bankDate || undefined);
    if (!result.success) throw new Error(result.message);
    setWorkspace(result.data); setError('');
    setCustomerId(current => current || result.data.uid);
  },[bankDate]);
  useEffect(() => { void refresh().catch(error => setError(error.message)); return () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }; },[refresh]);
  const run = async (work: () => Promise<any>) => {
    setBusy(true);
    try { const result = await work(); if (result?.success === false) throw new Error(result.message); await refresh(); toast({title:'Saved',description:result?.data?.message || 'The document workflow has been updated.'}); }
    catch(error) { toast({variant:'destructive',title:'Not completed',description:error instanceof Error ? error.message : 'Please retry.'}); }
    finally { setBusy(false); }
  };
  const upload = async (file: File, kind: string) => run(async () => {
    const body = new FormData(); body.set('file',file); body.set('kind',kind);
    if (kind === 'STATEMENT') { body.set('accountNumber',account); body.set('periodStart',periodStart); body.set('periodEnd',periodEnd); }
    const response = await fetch('/api/financial-documents',{method:'POST',headers:{Authorization:`Bearer ${await getRequiredIdToken()}`},body,signal:AbortSignal.timeout(125000)});
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    if (result.duplicate) toast({title:'Existing document',description:'This file was already uploaded. Use its existing entry below.'});
    return result;
  });
  const openReceipt = (receipt: any) => {
    setEdit(receipt);setDealId(receipt.dealId || '');
    if (receipt.purpose) setPurpose(receipt.purpose);
    if (receipt.customerId) setCustomerId(receipt.customerId);
    setFields({amount:0,paymentDate:'',reference:'',sender:'',beneficiary:'',accountNumber:'',transferStatus:'UNKNOWN',...receipt.fields});
  };
  const view = async (id: string, kind: string) => run(async () => {
    const response = await fetch(`/api/financial-documents?id=${id}&kind=${kind}`,{headers:{Authorization:`Bearer ${await getRequiredIdToken()}`}});
    if (!response.ok) throw new Error('Could not load the private document.');
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(await response.blob());
    setPreview({url:previewRef.current,type:response.headers.get('content-type') || ''});
  });
  const filtered = (workspace?.receipts || []).filter((receipt:any) => (filter === 'ALL' || receipt.status === filter)
    && `${receipt.originalName} ${receipt.fields?.reference || ''} ${receipt.purpose || ''}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="space-y-6">
    <PageHeader title={portal === 'admin' ? 'Bank Reconciliation & Receipts' : 'Payment Receipts'} description="Upload evidence, confirm extracted details, and track administrator verification. Uploading alone does not change balances." icon={FileCheck} />
    {error && <Card><CardContent className="pt-6"><p role="alert">{error}</p><Button onClick={() => void run(refresh)}>Retry loading</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>Upload a receipt</CardTitle><CardDescription>JPEG, PNG or PDF, maximum 5 MB. Use your phone camera or choose a saved document. Keep the amount, date and reference visible.</CardDescription></CardHeader><CardContent className="space-y-3">
      {workspace && !workspace.aiEnabled && <p className="text-sm text-amber-700">Automatic extraction is disabled pending paid-service privacy configuration. You can still upload and enter details manually.</p>}
      <div className="flex flex-wrap gap-3"><Label className="cursor-pointer rounded-md border p-3"><Upload className="mr-2 inline h-4 w-4" />Choose receipt<Input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={event => {const file=event.target.files?.[0];event.target.value='';if(file) void upload(file,'RECEIPT');}} /></Label>
      <Label className="cursor-pointer rounded-md border p-3">Take photo<Input className="sr-only" type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={event => {const file=event.target.files?.[0];event.target.value='';if(file) void upload(file,'RECEIPT');}} /></Label></div>
      {busy && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Processing… Please keep this page open.</p>}
    </CardContent></Card>
    {portal === 'admin' && workspace?.admin && <Card><CardHeader><CardTitle>Bank statements</CardTitle><CardDescription>Admin-only. Review every extracted row before confirming. Uploads may overlap; matching bank entries are not credited twice. CSV columns: date, amount, direction, reference, description. Dates: YYYY-MM-DD; direction: CREDIT or DEBIT. Excel exports must first be saved as CSV.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3"><div><Label>Bank account (10 digits)</Label><Input value={account} onChange={event=>setAccount(event.target.value)} /></div><div><Label>Statement begins</Label><Input type="date" value={periodStart} onChange={event=>setPeriodStart(event.target.value)} /></div><div><Label>Statement ends</Label><Input type="date" value={periodEnd} onChange={event=>setPeriodEnd(event.target.value)} /></div></div>
      <Input type="file" accept=".csv,application/pdf,image/jpeg,image/png" disabled={busy || account.length!==10 || !periodStart || !periodEnd} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file,'STATEMENT');}} />
      {workspace.statements.map((statement:any)=><div key={statement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p>{statement.originalName} <Badge variant="outline">{statement.status}</Badge></p><p className="text-xs text-muted-foreground">Account ending {statement.accountNumber.slice(-4)} · {statement.periodStart} — {statement.periodEnd}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={()=>void view(statement.id,'STATEMENT')}>View</Button>{statement.status==='DRAFT' && <Button disabled={busy} onClick={()=>{setStatementEdit(statement);setRows(statement.rows || []);}}>Review rows</Button>}</div></div>)}
      <Label>Find older bank entries around a payment date<Input type="date" value={bankDate} onChange={event=>setBankDate(event.target.value)} /></Label>
      {bankDate && <Button variant="outline" onClick={()=>setBankDate('')}>Show latest entries</Button>}
      <p className="text-xs text-muted-foreground">Shows 20 recent statements and up to 400 bank rows in the selected period (three days either side). Unassigned entries remain available for manual identification; nothing is automatically posted.</p>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Receipt history and verification</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex gap-3"><Input aria-label="Search receipts" placeholder="Search filename or reference" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}} /><select aria-label="Filter receipt status" className={selectClass} value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}>{['ALL','DRAFT','SUBMITTED','RECONCILED','POSTED','EVIDENCE_ONLY','VERIFIED_EVIDENCE','REJECTED'].map(status=><option key={status}>{status}</option>)}</select></div>
      {filtered.slice(page*10,page*10+10).map((receipt:any)=><div key={receipt.id} className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{receipt.originalName}</p><p className="text-sm">{names[receipt.purpose] || 'Details awaiting confirmation'} · {money(receipt.fields?.amount)} · {receipt.fields?.paymentDate || 'Date not confirmed'}</p><p className="text-xs text-muted-foreground">{receipt.fields?.reference}</p></div><Badge variant="outline">{receipt.status.replaceAll('_',' ')}</Badge></div>
        {receipt.extractionError && receipt.status==='DRAFT' && <p className="text-sm text-amber-700">Extraction needs attention. Review the original and enter the details.</p>}
        {receipt.status==='EVIDENCE_ONLY' && <p className="text-sm">Historical evidence saved without crediting the opening balance again.</p>}
        {receipt.status==='SUBMITTED' && <p className="text-sm">Awaiting bank reconciliation and administrator approval.</p>}
        {receipt.rejectionReason && <p className="text-sm text-destructive">{receipt.rejectionReason}</p>}
        {receipt.reversalWarning && <p role="alert" className="text-sm text-destructive">Bank reversal recorded. An administrator must review and record an audited financial correction; balances were not automatically reversed.</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void view(receipt.id,'RECEIPT')}>View original</Button>{['DRAFT','REJECTED'].includes(receipt.status) && <Button disabled={busy} onClick={()=>openReceipt(receipt)}>{receipt.status==='REJECTED'?'Correct and resubmit':'Confirm details'}</Button>}</div>
        {workspace?.admin && ['SUBMITTED','RECONCILED'].includes(receipt.status) && <div className="space-y-2 rounded-lg bg-muted p-3">
          {receipt.reconciliationState==='AWAITING_STATEMENT' && <p className="text-sm text-amber-700">Awaiting a reviewed statement covering this payment date.</p>}
          {receipt.status==='SUBMITTED' && <><p className="text-sm">{receipt.matches?.some((match:any)=>match.strong) ? 'Strong candidate found — verify before selecting.' : 'No unique strong match. Check coverage, references and account ownership.'}</p><select aria-label="Select bank entry" className={selectClass} value={bankSelections[receipt.id] || ''} onChange={event=>setBankSelections({...bankSelections,[receipt.id]:event.target.value})}><option value="">Select a reviewed bank entry</option>{workspace.bankRows.filter(row=>!row.reversed && row.amount>(row.allocatedAmount || 0)).map(row=><option key={row.id} value={row.id}>{row.date} · {row.direction} · {money(row.amount-(row.allocatedAmount || 0))} · {row.reference || row.description} · …{row.accountNumber.slice(-4)}</option>)}</select></>}
          <Input aria-label="Reconciliation note or rejection reason" placeholder="Record how you verified this payment (or rejection reason)" value={notes[receipt.id] || ''} onChange={event=>setNotes({...notes,[receipt.id]:event.target.value})} />
          <div className="flex flex-wrap gap-2">{receipt.status==='SUBMITTED' ? <Button disabled={busy || !bankSelections[receipt.id] || (notes[receipt.id] || '').length<5} onClick={()=>void run(async()=>reconcileFinancialReceiptAction(await getRequiredIdToken(),{id:receipt.id,bankEntryId:bankSelections[receipt.id],note:notes[receipt.id]}))}>Confirm bank match</Button> : <Button disabled={busy} onClick={()=>void run(async()=>postFinancialReceiptAction(await getRequiredIdToken(),receipt.id))}>Approve {['DISBURSEMENT','PROCUREMENT'].includes(receipt.purpose) ? 'evidence' : 'financial posting'}</Button>}<Button variant="destructive" disabled={busy || (notes[receipt.id] || '').length<5} onClick={()=>void run(async()=>rejectFinancialReceiptAction(await getRequiredIdToken(),receipt.id,notes[receipt.id]))}>Reject</Button></div>
        </div>}
      </div>)}
      {!filtered.length && <p className="py-6 text-center text-muted-foreground">No receipts in this category.</p>}
      <div className="flex items-center justify-between"><Button variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-sm">Page {page+1}</span><Button variant="outline" disabled={(page+1)*10>=filtered.length} onClick={()=>setPage(page+1)}>Next</Button></div>
    </CardContent></Card>
    <Dialog open={Boolean(edit)} onOpenChange={open=>{if(!open&&!busy)setEdit(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review receipt details</DialogTitle><DialogDescription>Check these against the original. Uncertain information must be corrected before submission. Older legacy payments are stored as evidence only.</DialogDescription></DialogHeader>
      <Label>Transaction purpose<select className={selectClass} value={purpose} onChange={event=>setPurpose(event.target.value)}>{receiptPurposes.filter(value=>workspace?.admin || value!=='DISBURSEMENT').map(value=><option key={value} value={value}>{names[value]}</option>)}</select></Label>
      {workspace?.admin && <Label>Customer<select className={selectClass} value={customerId} onChange={event=>{setCustomerId(event.target.value);setDealId('');}}><option value="">Select existing customer</option>{workspace.users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Label>}
      {purpose!=='INVESTOR_CONTRIBUTION' && <Label>Related deal<select className={selectClass} value={dealId} onChange={event=>setDealId(event.target.value)}><option value="">Select deal (optional for historical evidence)</option>{workspace?.deals.filter(deal=>deal.clientId===customerId).map(deal=><option key={deal.id} value={deal.id}>{deal.name} · {deal.status}</option>)}</select></Label>}
      <div className="grid grid-cols-2 gap-3"><Label>Amount (₦)<Input type="number" min="0.01" step="0.01" value={fields.amount || ''} onChange={event=>setFields({...fields,amount:Number(event.target.value)})} /></Label><Label>Payment date<Input type="date" value={fields.paymentDate} onChange={event=>setFields({...fields,paymentDate:event.target.value})} /></Label></div>
      {(['reference','sender','beneficiary','accountNumber'] as const).map(key=><Label key={key}>{key==='accountNumber'?'NAL bank account for reconciliation':key.charAt(0).toUpperCase()+key.slice(1)}<Input value={fields[key]} onChange={event=>setFields({...fields,[key]:event.target.value})} /></Label>)}
      <Label>Transfer status<select className={selectClass} value={fields.transferStatus} onChange={event=>setFields({...fields,transferStatus:event.target.value as ReceiptFields['transferStatus']})}>{['UNKNOWN','SUCCESSFUL','PENDING','FAILED'].map(value=><option key={value}>{value}</option>)}</select></Label>
      {purpose==='INVESTOR_CONTRIBUTION' && <Label>Investment tenure (days)<Input type="number" min="1" max="3650" value={tenure} onChange={event=>setTenure(Number(event.target.value))} /></Label>}
      <Button disabled={busy || !fields.amount || !fields.paymentDate || !customerId} onClick={()=>void run(async()=>{const result=await submitFinancialReceiptAction(await getRequiredIdToken(),{id:edit.id,purpose,customerId,dealId,fields,tenureValue:tenure,tenureUnit:'Days'});if(result.success)setEdit(null);return result;})}>Submit for verification</Button>
    </DialogContent></Dialog>
    <Dialog open={Boolean(statementEdit)} onOpenChange={open=>{if(!open&&!busy)setStatementEdit(null);}}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Review statement rows</DialogTitle><DialogDescription>Compare all rows with the original statement. Correct missing or misread entries, identify reversals, and confirm coverage before importing.</DialogDescription></DialogHeader>
      {statementEdit?.extractionError && <p className="text-sm text-amber-700">Extraction unavailable. Enter rows below or use the documented CSV format.</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Date','Amount','Direction','Reference','Description','Reversed',''].map((text,index)=><th key={index} className="p-2 text-left">{text}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}><td><Input type="date" value={row.date} onChange={event=>setRows(rows.map((value,i)=>i===index?{...value,date:event.target.value}:value))} /></td><td><Input className="min-w-28" type="number" step="0.01" value={row.amount} onChange={event=>setRows(rows.map((value,i)=>i===index?{...value,amount:Number(event.target.value)}:value))} /></td><td><select className={selectClass} value={row.direction} onChange={event=>setRows(rows.map((value,i)=>i===index?{...value,direction:event.target.value}:value))}><option>CREDIT</option><option>DEBIT</option></select></td>{['reference','description'].map(key=><td key={key}><Input value={row[key]} onChange={event=>setRows(rows.map((value,i)=>i===index?{...value,[key]:event.target.value}:value))} /></td>)}<td><input aria-label={`Row ${index+1} reversed`} type="checkbox" checked={row.reversed} onChange={event=>setRows(rows.map((value,i)=>i===index?{...value,reversed:event.target.checked}:value))} /></td><td><Button size="icon" variant="ghost" aria-label="Remove row" onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>
      <Button variant="outline" disabled={rows.length>=400} onClick={()=>setRows([...rows,{date:periodStart || statementEdit?.periodStart || '',amount:0,direction:'CREDIT',reference:'',description:'',reversed:false}])}><Plus className="mr-2 h-4 w-4" />Add row</Button>
      <Button disabled={busy || !rows.length} onClick={()=>void run(async()=>{const result=await confirmBankStatementAction(await getRequiredIdToken(),{id:statementEdit.id,rows});if(result.success)setStatementEdit(null);return result;})}>Confirm {rows.length} reviewed rows</Button>
    </DialogContent></Dialog>
    <Dialog open={Boolean(preview)} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Original private document</DialogTitle><DialogDescription>Accessible only to authorised accounts.</DialogDescription></DialogHeader>{preview?.type.startsWith('image/') ? <Image unoptimized width={800} height={1100} src={preview.url} alt="Original transaction evidence" className="max-h-[70vh] w-full object-contain" /> : preview && <iframe title="Original document" src={preview.url} className="h-[65vh] w-full" />}</DialogContent></Dialog>
  </div>;
}
