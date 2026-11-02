'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { LayoutDashboard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadMarketerWorkspaceAction, recordMarketerFollowUpAction } from './actions';

type Workspace = Awaited<ReturnType<typeof loadMarketerWorkspaceAction>>;
const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n / 100);
export default function MarketerDashboardPage() {
  const auth = useAuth(), { user } = useUser();
  const [data, setData] = useState<Workspace | null>(null), [error, setError] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const [operationId,setOperationId] = useState('');
  useEffect(() => { setOperationId(crypto.randomUUID()); },[]);
  const token = useCallback(async () => { if (!auth?.currentUser) throw new Error('Sign in to continue.'); return auth.currentUser.getIdToken(); }, [auth]);
  const load = useCallback(async () => { try { const uid=auth?.currentUser?.uid; const result=await loadMarketerWorkspaceAction(await token()); if (uid === auth?.currentUser?.uid) setData(result); setError(''); } catch(e) { setData(null); setError(e instanceof Error ? e.message : 'Unable to load workspace.'); } },[token,auth]);
  useEffect(() => { setData(null); if (user) void load(); }, [user,load]);
  const totals = (data?.commissions || []).reduce((s,c) => ({ earned:s.earned+c.earnedKobo, paid:s.paid+c.paidKobo, outstanding:s.outstanding+c.outstandingKobo }),{earned:0,paid:0,outstanding:0});
  async function follow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, f = new FormData(form); setBusy(true); setNotice('');
    try {
      await recordMarketerFollowUpAction({ authToken: await token(), operationId, taskId: String(f.get('taskId')), notes:String(f.get('notes')), outcome:String(f.get('outcome')),
        nextActionAt: new Date(String(f.get('nextActionAt'))).toISOString(), ...(f.get('promiseAmount') ? { promiseAmount:Number(f.get('promiseAmount')), promiseDueAt:new Date(String(f.get('promiseDueAt'))).toISOString() } : {}),
      }); setOperationId(crypto.randomUUID()); form.reset(); setNotice('Follow-up saved. Payment confirmation remains with finance.'); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to save follow-up.'); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <PageHeader title="Marketer Dashboard" description="Your assigned clients, earned commissions and recovery work." icon={LayoutDashboard}/>
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <Button variant="outline" onClick={load}>Refresh assignments</Button>
    <div className="grid gap-4 sm:grid-cols-3">{[['Commission earned',totals.earned],['Commission paid',totals.paid],['Commission outstanding',totals.outstanding]].map(([title,value]) => <Card key={title}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data ? money(Number(value)) : 'Loading…'}</CardContent></Card>)}</div>
    <p className="text-sm text-muted-foreground">Commission is 5% of agreed profit on eligible signed Murabaha contracts. Outstanding means earned minus paid. NAL bears the cost on termination; there is no marketer clawback.</p>
    <Card><CardHeader><CardTitle>Commission history</CardTitle></CardHeader><CardContent className="space-y-3">{data?.commissions.length === 0 && <p>No eligible signed commissions yet.</p>}{data?.commissions.map(c => <div key={c.id} className="rounded border p-3"><p className="font-medium">{c.dealName}</p><p>Earned {money(c.earnedKobo)} · Paid {money(c.paidKobo)} · Outstanding {money(c.outstandingKobo)}</p></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Assigned clients and recovery tasks</CardTitle></CardHeader><CardContent className="space-y-4">{data?.clients.length === 0 && <p>No clients assigned to you yet.</p>}{data?.clients.map(c => <article key={c.dealId} className="rounded border p-4 space-y-2"><h3 className="font-semibold">{c.clientName} · {c.dealName}</h3><p>{c.phoneNumber || 'Contact details pending'} · {c.status}</p>{c.tasks.length === 0 && <p className="text-sm text-muted-foreground">No recovery instalments currently due for this contract.</p>}{c.tasks.map(t => <div key={t.id} className="text-sm"><p>Instalment {t.installmentNumber}: {t.status} · Outstanding {money(Math.round(t.amountOutstanding * 100))}</p>{t.nextActionAt && <p>Follow-up: {new Date(t.nextActionAt).toLocaleString()}</p>}{t.promiseAmount > 0 && <p>Promise {money(Math.round(t.promiseAmount * 100))} by {new Date(t.promiseDueAt).toLocaleString()} (unconfirmed)</p>}</div>)}</article>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Record a follow-up</CardTitle></CardHeader><CardContent><form onSubmit={follow} className="grid gap-4 max-w-xl">
      <Label htmlFor="taskId">Assigned recovery task</Label><select id="taskId" name="taskId" className="border rounded p-2 bg-background" required defaultValue=""><option value="" disabled>Select task</option>{data?.clients.flatMap(c => c.tasks.map(t => <option key={t.id} value={t.id}>{c.clientName} / {c.dealName} / instalment {t.installmentNumber}</option>))}</select>
      <Label htmlFor="outcome">Outcome</Label><select id="outcome" name="outcome" className="border rounded p-2 bg-background"><option value="CONTACTED">Contacted</option><option value="NO_ANSWER">No answer</option><option value="FOLLOW_UP_REQUIRED">Follow-up required</option><option value="PROMISE_TO_PAY">Promise to pay</option></select>
      <Label htmlFor="notes">Contact notes</Label><textarea id="notes" name="notes" minLength={3} maxLength={4000} required className="border rounded p-2 bg-background"/>
      <Label htmlFor="nextActionAt">Next follow-up</Label><Input id="nextActionAt" name="nextActionAt" type="datetime-local" required/>
      <Label htmlFor="promiseAmount">Promise amount (only for a promise)</Label><Input id="promiseAmount" name="promiseAmount" type="number" min="0.01" step="0.01"/>
      <Label htmlFor="promiseDueAt">Promise due date</Label><Input id="promiseDueAt" name="promiseDueAt" type="datetime-local"/>
      <p className="text-sm text-muted-foreground">A note or promise never credits a client payment. Finance confirms cleared receipts.</p><Button disabled={busy || !data?.clients.some(c => c.tasks.length)}>Save follow-up</Button>
    </form></CardContent></Card>
  </div>;
}
