'use client';

import { useMemo, useState } from 'react';
import { CalendarSync, Check, Clock, Loader2, X } from 'lucide-react';
import { processRepaymentPlanChangeAction } from '@/app/repayment-plan-actions';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { collection, query, where, type Timestamp } from 'firebase/firestore';
import { useCollection, useFirestore } from '@/firebase';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useToast } from '@/hooks/use-toast';

type Terms = { durationValue: number; durationUnit: string; repaymentFrequency: string; repaymentPlanVersion?: number };
type ChangeRequest = {
  id: string;
  dealId: string;
  dealName: string;
  clientId: string;
  clientName: string;
  status: 'Pending';
  currentTerms: Terms;
  proposedTerms: Pick<Terms, 'repaymentFrequency'>;
  reason: string;
  requestedAt: Timestamp;
};

function TermsBlock({ label, frequency, duration, proposed = false }: { label: string; frequency: string; duration?: string; proposed?: boolean }) {
  return <div className={`rounded-lg border p-3 ${proposed ? 'border-primary/30 bg-primary/5' : 'bg-muted/20'}`}><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-2 font-medium">{frequency} repayments</div>{duration && <div className="text-sm text-muted-foreground">Duration: {duration} (unchanged)</div>}</div>;
}

export default function RepaymentChangesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState('');
  const requestsQuery = useMemo(() => firestore ? query(collection(firestore, 'repaymentPlanChangeRequests'), where('status', '==', 'Pending')) : null, [firestore]);
  const { data: requests, loading } = useCollection<ChangeRequest>(requestsQuery);

  const process = async (request: ChangeRequest, decision: 'Approved' | 'Rejected') => {
    setProcessingId(request.id);
    try {
      const result = await processRepaymentPlanChangeAction({ authToken: await getRequiredIdToken(), requestId: request.id, decision });
      toast({ title: `Request ${decision}`, description: result.message });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Request could not be processed', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setProcessingId(''); }
  };

  return <div><PageHeader title="Repayment Frequency Changes" description="Review client requests to change repayment frequency without altering contractual duration or maturity." icon={CalendarSync} />{loading ? <div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((item) => <Skeleton key={item} className="h-72" />)}</div> : !requests?.length ? <Card><CardContent className="py-16 text-center text-muted-foreground"><Clock className="mx-auto mb-3 h-10 w-10" />No repayment-frequency changes are awaiting approval.</CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{requests.map((request) => <Card key={request.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{request.dealName}</CardTitle><CardDescription>{request.clientName} · Requested {request.requestedAt?.toDate().toLocaleString('en-NG')}</CardDescription></div><Badge variant="outline">Pending</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><TermsBlock label="Current frequency" frequency={request.currentTerms.repaymentFrequency} duration={`${request.currentTerms.durationValue} ${request.currentTerms.durationUnit}`} /><TermsBlock label="Proposed frequency" frequency={request.proposedTerms.repaymentFrequency} proposed /></div><div className="rounded-lg border p-3 text-sm"><div className="font-medium">Client&apos;s reason</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.reason}</p></div><p className="text-xs text-muted-foreground">Approval preserves completed repayment records and redistributes only the unpaid contractual principal and profit across the time remaining before the existing maturity date.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => void process(request, 'Rejected')} disabled={Boolean(processingId)}><X className="mr-2 h-4 w-4" /> Reject</Button><Button onClick={() => void process(request, 'Approved')} disabled={Boolean(processingId)}>{processingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Approve Frequency</Button></div></CardContent></Card>)}</div>}</div>;
}
