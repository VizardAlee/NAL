'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { canWriteAdmin } from '@/lib/access-control';
import { PageHeader } from '@/components/page-header';
import { Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { allocateMarketingFundsAction, assignDealMarketerAction, loadMarketingAdminAction, reconcileMarketingReceiptsAction, recordMarketingPayoutAction } from './actions';

type Data = Awaited<ReturnType<typeof loadMarketingAdminAction>>;
const money = (n: number) => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(n / 100);
export default function MarketingAdminPage() {
  const auth = useAuth(), { user } = useUser();
  const [data,setData] = useState<Data | null>(null), [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false);
  const [keys,setKeys] = useState({ allocation:'', payout:'' });
  useEffect(() => { setKeys({ allocation:crypto.randomUUID(), payout:crypto.randomUUID() }); },[]);
  const token = useCallback(async () => { if (!auth?.currentUser) throw new Error('Sign in to continue.'); return auth.currentUser.getIdToken(); },[auth]);
  const load = useCallback(async () => { try { setData(await loadMarketingAdminAction(await token())); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to load marketing fund.'); } },[token]);
  useEffect(() => { if (user) void load(); },[user,load]);
  async function run(work: () => Promise<unknown>, message: string) { setBusy(true); setError(''); setNotice(''); try { await work(); setNotice(message); await load(); } catch(e) { setError(e instanceof Error ? e.message : 'Operation failed.'); } finally { setBusy(false); } }
  async function allocate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget, f=new FormData(form);
    await run(async () => { await allocateMarketingFundsAction({ authToken:await token(), operationId:keys.allocation, sourceBatchId:String(f.get('sourceBatchId')), sourceCategory:String(f.get('sourceCategory')), amount:Number(f.get('amount')), reason:String(f.get('reason')) }); setKeys(k=>({...k,allocation:crypto.randomUUID()})); form.reset(); }, 'Company funds allocated to the marketing pool. No shareholder loan was created.');
  }
  async function payout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget, f=new FormData(form);
    await run(async () => { await recordMarketingPayoutAction({ authToken:await token(), operationId:keys.payout, dealId:String(f.get('dealId')), amount:Number(f.get('amount')), reference:String(f.get('reference')) }); setKeys(k=>({...k,payout:crypto.randomUUID()})); form.reset(); }, 'Existing external commission payment recorded. No money transfer was performed.');
  }
  const writable=canWriteAdmin(user);
  const totals=(data?.commissions || []).reduce((s,c)=>({earned:s.earned+c.earnedKobo,paid:s.paid+c.fundedKobo,unreplenished:s.unreplenished+c.fundedKobo-c.replenishedKobo}),{earned:0,paid:0,unreplenished:0});
  return <div className="space-y-6"><PageHeader title="Marketing fund and commissions" description="Signed Murabaha commissions and internal revolving funds." icon={Wallet}/><Link href="/admin/funds" className="underline">Back to funds</Link>
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Marketing pool available', Math.max(0,data?.balanceKobo || 0)],['Commission earned',totals.earned],['Commission unpaid',totals.earned-totals.paid],['Funding unreplenished',totals.unreplenished]].map(([title,value])=><Card key={title}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data ? money(Number(value)) : 'Loading…'}</CardContent></Card>)}</div>
    {(data?.balanceKobo || 0)<0 && <p role="alert" className="text-destructive">Pool shortfall: {money(-data!.balanceKobo)}. A reversal exceeded available reserved funds. Allocate company funds before further payments.</p>}
    <p className="text-sm text-muted-foreground">Earned commission is 5% of the signed agreed profit. Internal allocations do not create shareholder loans. Replenishment follows net approved contract receipts, excluding fees. Termination does not cancel commission or erase client debt. Historical contracts are not automatically commissioned.</p>
    {writable && <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Allocate company funds</CardTitle></CardHeader><CardContent><form onSubmit={allocate} className="grid gap-3">
      <Label htmlFor="sourceBatchId">Available company fund batch</Label><select id="sourceBatchId" name="sourceBatchId" required defaultValue="" className="border rounded p-2 bg-background"><option disabled value="">Select source</option>{data?.sources.map(s=><option key={s.id} value={s.id}>{s.id} · {money(Math.round(s.amount*100))}</option>)}</select>
      <Label htmlFor="sourceCategory">Source classification</Label><select id="sourceCategory" name="sourceCategory" className="border rounded p-2 bg-background"><option value="RETAINED_EARNINGS">Retained earnings</option><option value="SHAREHOLDER_FUNDS">Company shareholder capital</option></select>
      <Label htmlFor="allocationAmount">Allocation amount</Label><Input id="allocationAmount" name="amount" type="number" min="0.01" step="0.01" required/>
      <Label htmlFor="reason">Source evidence and reason</Label><Input id="reason" name="reason" minLength={5} maxLength={500} required/>
      <Button disabled={busy || !keys.allocation}>Allocate to marketing pool</Button>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Record commission payment</CardTitle></CardHeader><CardContent><form onSubmit={payout} className="grid gap-3">
      <p className="text-sm text-muted-foreground">Record a payment already made and verified outside this app. This action does not initiate a bank transfer.</p>
      <Label htmlFor="payoutDeal">Signed commission</Label><select id="payoutDeal" name="dealId" required defaultValue="" className="border rounded p-2 bg-background"><option disabled value="">Select earned commission</option>{data?.commissions.filter(c=>c.earnedKobo>c.fundedKobo).map(c=><option key={c.id} value={c.id}>{data.deals.find(d=>d.id===c.id)?.name || c.id} · {c.marketerName} · unpaid {money(c.earnedKobo-c.fundedKobo)}</option>)}</select>
      <Label htmlFor="payoutAmount">Amount paid</Label><Input id="payoutAmount" name="amount" type="number" min="0.01" step="0.01" required/>
      <Label htmlFor="reference">External payment reference</Label><Input id="reference" name="reference" minLength={3} maxLength={160} required/>
      <Button disabled={busy || !keys.payout}>Record verified commission payment</Button>
    </form></CardContent></Card></div>}
    <Card><CardHeader><CardTitle>Signed commission ledger</CardTitle></CardHeader><CardContent className="space-y-4">{data?.commissions.length===0 && <p>No eligible signed commissions yet.</p>}{data?.commissions.map(c=><article key={c.id} className="border rounded p-4 space-y-2"><h3 className="font-semibold">{data.deals.find(d=>d.id===c.id)?.name || c.id} · {c.marketerName}</h3><p>Earned {money(c.earnedKobo)} · Paid {money(c.fundedKobo)} · Unpaid {money(c.earnedKobo-c.fundedKobo)}</p><p>Replenished {money(c.replenishedKobo)} · Unreplenished {money(c.fundedKobo-c.replenishedKobo)}</p>{c.pendingReplenishmentKobo > 0 && <p role="alert" className="text-destructive">Receipt allocation awaiting cash backing: {money(c.pendingReplenishmentKobo)}. Collections remain valid; further commission payments are paused.</p>}<p className="text-sm text-muted-foreground">Net cleared {money(c.netClearedKobo)} / signed repayment {money(c.repaymentBasisKobo)}</p>{writable && <Button variant="outline" disabled={busy} onClick={()=>run(async()=>reconcileMarketingReceiptsAction({authToken:await token(),dealId:c.id}),'Net cleared receipts reconciled. Original amounts and adjustment history retained.')}>Reconcile cleared receipts</Button>}</article>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Client and recovery assignments</CardTitle></CardHeader><CardContent className="space-y-3">{data?.deals.map(d=><div key={d.id} className="border rounded p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{d.clientName} · {d.name}</p><p className="text-sm text-muted-foreground">{d.status} · {d.eligible ? 'Prospective commission policy' : 'Historical / no automatic commission'}</p></div><select aria-label={`Marketer for ${d.name}`} disabled={!writable || busy} value={d.marketerId} className="border rounded p-2 bg-background sm:max-w-64" onChange={e=>run(async()=>assignDealMarketerAction({authToken:await token(),dealId:d.id,marketerId:e.target.value}),'Assignment updated; existing earned commission retained.')}><option value="">Unassigned</option>{data.marketers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Allocation and payment audit</CardTitle></CardHeader><CardContent className="space-y-2">{data?.operations.map(o=><p key={o.id} className="text-sm break-words">{o.kind.replaceAll('_',' ')} · {money(o.amountKobo)} · {o.reference} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</p>)}</CardContent></Card>
  </div>;
}
