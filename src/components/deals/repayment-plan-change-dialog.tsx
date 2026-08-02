'use client';

import { useState, useTransition } from 'react';
import { CalendarSync, Loader2 } from 'lucide-react';
import { requestRepaymentPlanChangeAction } from '@/app/repayment-plan-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Deal } from '@/lib/types';

export function RepaymentPlanChangeDialog({ deal }: { deal: Deal }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [durationValue, setDurationValue] = useState(String(deal.durationValue));
  const [durationUnit, setDurationUnit] = useState<Deal['durationUnit']>(deal.durationUnit);
  const [frequency, setFrequency] = useState<Deal['repaymentFrequency']>(deal.repaymentFrequency);
  const [reason, setReason] = useState('');
  const [working, startTransition] = useTransition();
  const awaitingApproval = Boolean(deal.pendingRepaymentPlanChangeRequestId);

  const submit = () => startTransition(async () => {
    if (!user) return;
    const result = await requestRepaymentPlanChangeAction({
      authToken: await getRequiredIdToken(),
      dealId: deal.id,
      clientId: user.uid,
      durationValue: Number(durationValue),
      durationUnit,
      repaymentFrequency: frequency,
      reason,
    });
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Request not submitted', description: result.message });
      return;
    }
    toast({ title: 'Repayment change requested', description: result.message });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!working) setOpen(next); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm" disabled={awaitingApproval}><CalendarSync className="mr-2 h-4 w-4" /> {awaitingApproval ? 'Plan Change Awaiting Approval' : 'Request Repayment Change'}</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Request a revised repayment plan</DialogTitle><DialogDescription>The current schedule remains binding until an administrator approves this request. Approved repayment history and the total remaining principal and profit will not be changed.</DialogDescription></DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm"><div className="font-medium">Current terms</div><div className="mt-1 text-muted-foreground">{deal.durationValue} {deal.durationUnit} · {deal.repaymentFrequency} repayments</div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-duration">New remaining duration</Label><Input id="new-duration" type="number" min="1" max="120" step="1" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} /></div><div className="space-y-2"><Label>Duration unit</Label><Select value={durationUnit} onValueChange={(value) => setDurationUnit(value as Deal['durationUnit'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Days', 'Weeks', 'Fortnights', 'Months', 'Years'].map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="space-y-2"><Label>New repayment frequency</Label><Select value={frequency} onValueChange={(value) => setFrequency(value as Deal['repaymentFrequency'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['Daily', 'Weekly', 'Fortnightly', 'Monthly'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="change-reason">Reason for the request</Label><Textarea id="change-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why the repayment schedule needs to change." maxLength={1_000} /></div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={working}>Cancel</Button><Button onClick={submit} disabled={working || !durationValue || reason.trim().length < 10}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit for approval</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
