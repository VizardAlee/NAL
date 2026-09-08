'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArchiveRestore, ArrowRight, CalendarCheck, FileWarning, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useToast } from '@/hooks/use-toast';
import { createHistoricalImportAction, getHistoricalImportWorkspaceAction, setHistoricalImportAvailabilityAction } from './actions';

type Workspace = Awaited<ReturnType<typeof getHistoricalImportWorkspaceAction>>;

const statusStyle: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', NEEDS_ATTENTION: 'bg-red-100 text-red-700', READY_FOR_REVIEW: 'bg-amber-100 text-amber-800', POSTED: 'bg-emerald-100 text-emerald-800',
};

export default function HistoricalImportsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [partyMode, setPartyMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [existingUserId, setExistingUserId] = useState('');
  const [partyKind, setPartyKind] = useState<'CLIENT' | 'INVESTOR' | 'BOTH'>('CLIENT');
  const [partyName, setPartyName] = useState('');
  const [accountType, setAccountType] = useState<'Individual' | 'Organization'>('Individual');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setWorkspace(await getHistoricalImportWorkspaceAction(await getRequiredIdToken())); }
    catch (error) { toast({ variant: 'destructive', title: 'Historical imports unavailable', description: error instanceof Error ? error.message : 'Could not load the migration workspace.' }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void refresh(); }, [refresh]);

  const matchingUsers = useMemo(() => (workspace?.users || []).filter((user) => {
    const needle = search.toLowerCase();
    return !needle || user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle);
  }).slice(0, 20), [workspace, search]);

  const selectExisting = (id: string) => {
    setExistingUserId(id);
    const selected = workspace?.users.find((user) => user.id === id);
    if (selected) { setPartyName(selected.name); setAccountType(selected.accountType as 'Individual' | 'Organization'); }
  };

  const createCase = () => startTransition(async () => {
    try {
      const result = await createHistoricalImportAction({ authToken: await getRequiredIdToken(), partyMode, existingUserId: partyMode === 'EXISTING' ? existingUserId : undefined, partyKind, partyName, accountType, asOfDate });
      setOpen(false); router.push(`/admin/historical-imports/${result.importId}`);
    } catch (error) { toast({ variant: 'destructive', title: 'Import case not created', description: error instanceof Error ? error.message : 'Check the supplied information.' }); }
  });

  const toggleAvailability = () => startTransition(async () => {
    if (!workspace) return;
    try {
      await setHistoricalImportAvailabilityAction({ authToken: await getRequiredIdToken(), enabled: !workspace.setting.enabled, recordsAccurateThrough: asOfDate });
      await refresh();
      toast({ title: workspace.setting.enabled ? 'New imports disabled' : 'Historical importing enabled' });
    } catch (error) { toast({ variant: 'destructive', title: 'Setting not changed', description: error instanceof Error ? error.message : 'Try again.' }); }
  });

  const posted = workspace?.cases.filter((item) => item.status === 'POSTED').length || 0;
  const attention = workspace?.cases.filter((item) => item.status === 'NEEDS_ATTENTION').length || 0;
  return <div className="space-y-6">
    <PageHeader title="Historical Records Migration" description="Temporarily reconstruct pre-app accounts and deals from administrator-supplied evidence." icon={ArchiveRestore}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button disabled={!workspace?.setting.enabled}><Plus className="mr-2 h-4 w-4" />Start Import</Button></DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Start a historical import</DialogTitle><DialogDescription>Use an existing account whenever possible. A new profile remains unclaimed until the customer accepts an invitation.</DialogDescription></DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="grid gap-2"><Label>Customer source</Label><Select value={partyMode} onValueChange={(value: 'EXISTING' | 'NEW') => setPartyMode(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXISTING">Use existing client or investor</SelectItem><SelectItem value="NEW">Create an unclaimed profile</SelectItem></SelectContent></Select></div>
            {partyMode === 'EXISTING' ? <div className="grid gap-2"><Label>Find account</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /></div><Select value={existingUserId} onValueChange={selectExisting}><SelectTrigger><SelectValue placeholder="Select the matching account" /></SelectTrigger><SelectContent>{matchingUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}{user.accountClaimStatus === 'UNCLAIMED' ? ' · Unclaimed' : ''}</SelectItem>)}</SelectContent></Select></div> : <><div className="grid gap-2"><Label>Customer or organisation name</Label><Input value={partyName} onChange={(event) => setPartyName(event.target.value)} /></div><div className="grid gap-2"><Label>Account type</Label><Select value={accountType} onValueChange={(value: 'Individual' | 'Organization') => setAccountType(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Individual">Individual</SelectItem><SelectItem value="Organization">Organisation / Business</SelectItem></SelectContent></Select></div></>}
            <div className="grid gap-2"><Label>Business relationship</Label><Select value={partyKind} onValueChange={(value: 'CLIENT' | 'INVESTOR' | 'BOTH') => setPartyKind(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CLIENT">Client</SelectItem><SelectItem value="INVESTOR">Investor</SelectItem><SelectItem value="BOTH">Client and investor</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label>Records accurate as of</Label><Input type="date" value={asOfDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setAsOfDate(event.target.value)} /></div>
            <Button onClick={createCase} disabled={pending || !partyName || (partyMode === 'EXISTING' && !existingUserId)}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Import Workspace</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageHeader>
    {!workspace?.setting.enabled && <Alert><CalendarCheck className="h-4 w-4" /><AlertTitle>Historical importing is closed</AlertTitle><AlertDescription>Existing evidence and posted records remain available. Re-enable the workspace only if older records still need migration.</AlertDescription></Alert>}
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardDescription>Total cases</CardDescription><CardTitle>{workspace?.cases.length || 0}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Successfully posted</CardDescription><CardTitle className="text-emerald-700">{posted}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Need attention</CardDescription><CardTitle className="text-red-700">{attention}</CardTitle></CardHeader></Card>
    </div>
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Migration cases</CardTitle><CardDescription>Drafts auto-save after extraction and review. Posted cases are immutable.</CardDescription></div><Button variant="outline" onClick={toggleAvailability} disabled={pending || loading}>{workspace?.setting.enabled ? 'Close new imports' : 'Re-enable imports'}</Button></CardHeader>
      <CardContent className="space-y-3">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : !workspace?.cases.length ? <div className="rounded-lg border border-dashed p-12 text-center"><ArchiveRestore className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">No historical imports yet</p><p className="text-sm text-muted-foreground">Begin with one active client and one repeat investor as the pilot.</p></div> : workspace.cases.map((item) => <button key={item.id} onClick={() => router.push(`/admin/historical-imports/${item.id}`)} className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/40"><div className="rounded-lg bg-primary/10 p-3">{item.status === 'NEEDS_ATTENTION' ? <FileWarning className="h-5 w-5 text-red-600" /> : <ShieldCheck className="h-5 w-5 text-primary" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.partyName}</p><Badge variant="outline">{item.partyKind}</Badge><Badge className={statusStyle[item.status] || ''}>{String(item.status).replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.documents?.length || 0} document(s) · Records as of {item.asOfDate ? new Date(item.asOfDate).toLocaleDateString('en-NG') : '—'}</p></div><ArrowRight className="h-5 w-5 text-muted-foreground" /></button>)}
      </CardContent>
    </Card>
  </div>;
}
