
'use client';

import { useMemo, useState, useTransition } from 'react';
import { notFound, useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FileText, Users, Landmark, Zap, Loader2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Deal } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { fundDealAction } from './fund-deal-action';
import { useToast } from '@/hooks/use-toast';

type Investment = DocumentData & {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  createdAt: Timestamp;
};

type User = {
    id: string;
    name: string;
}

type FundBatch = {
    id: string;
    sourceId: string;
    remainingAmount: number;
    tenureValue: number;
    tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
};

const DURATION_IN_DAYS = {
    Days: 1,
    Weeks: 7,
    Fortnights: 14,
    Months: 30, // Approximation
    Years: 365,
};

function convertToDays(value: number, unit: keyof typeof DURATION_IN_DAYS): number {
    return value * (DURATION_IN_DAYS[unit] || 0);
}


function DealDetailSkeleton() {
    return (
        <div>
            <PageHeader title="Loading Deal..." description="Please wait while we fetch the details." icon={FileText} />
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
                </div>
                <div className="lg:col-span-1 space-y-6">
                    <Card><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
                </div>
            </div>
        </div>
    )
}

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try { return format(date, 'PPP p'); } catch { return 'Invalid Date'; }
};

export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const dealRef = useMemo(() => {
    if (!firestore || !dealId) return null;
    return doc(firestore, 'deals', dealId) as doc<Deal>;
  }, [firestore, dealId]);

  const investmentsQuery = useMemo(() => {
    if (!firestore || !dealId) return null;
    return query(collection(firestore, 'investments'), where('dealId', '==', dealId));
  }, [firestore, dealId]);
  
  const usersQuery = useMemo(() => (firestore ? collection(firestore, 'users') : null), [firestore]);
  const fundBatchesQuery = useMemo(() => (firestore ? query(collection(firestore, 'fundBatches'), where('remainingAmount', '>', 0)) : null), [firestore]);

  const { data: deal, loading: dealLoading } = useDoc<Deal>(dealRef);
  const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);
  const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);
  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);

  const isLoading = dealLoading || investmentsLoading || usersLoading || fundBatchesLoading;

  const totalFunded = useMemo(() => {
    if (!investments) return 0;
    return investments.reduce((sum, inv) => sum + inv.amount, 0);
  }, [investments]);

  const fundingProgress = useMemo(() => {
    if (!deal || deal.principal === 0) return 0;
    return (totalFunded / deal.principal) * 100;
  }, [totalFunded, deal]);

  const isFullyFunded = useMemo(() => totalFunded >= (deal?.principal ?? 0), [totalFunded, deal]);

  const investorsInDeal = useMemo(() => {
    if (!investments || !users) return [];
    const investorMap = new Map<string, { name: string; amount: number }>();
    investments.forEach(inv => {
        const user = users.find(u => u.id === inv.investorId);
        const name = user?.name || 'Unknown Investor';
        const currentAmount = investorMap.get(inv.investorId)?.amount || 0;
        investorMap.set(inv.investorId, { name, amount: currentAmount + inv.amount });
    });
    return Array.from(investorMap.entries()).map(([id, data]) => ({
      id,
      investorName: data.name,
      amount: data.amount
    }));
  }, [investments, users]);

  const eligibleInvestors = useMemo(() => {
    if (!deal || !fundBatches || !users) return [];
    
    const dealDurationInDays = convertToDays(deal.durationValue, deal.durationUnit);

    const eligibleBatches = fundBatches.filter(batch => {
        const batchTenureInDays = convertToDays(batch.tenureValue, batch.tenureUnit);
        return batchTenureInDays >= dealDurationInDays;
    });

    // Aggregate by investor
    const investorMap = new Map<string, { name: string; totalAvailable: number }>();
    eligibleBatches.forEach(batch => {
        const user = users.find(u => u.id === batch.sourceId);
        if (user) {
            const current = investorMap.get(user.id) || { name: user.name, totalAvailable: 0 };
            current.totalAvailable += batch.remainingAmount;
            investorMap.set(user.id, current);
        }
    });

    return Array.from(investorMap.values());
  }, [deal, fundBatches, users]);

  const handleFundDeal = () => {
    startTransition(async () => {
        const result = await fundDealAction(dealId);
        if(result.success) {
            toast({
                title: "Deal Funding Complete",
                description: result.message,
            });
        } else {
            toast({
                variant: 'destructive',
                title: "Funding Failed",
                description: result.message,
            });
        }
    });
  }

  if (isLoading) {
    return <DealDetailSkeleton />;
  }

  if (!deal) {
    return notFound();
  }

  const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
  } as const;


  return (
    <div>
        <PageHeader title={deal.dealName} icon={FileText}>
           <Badge variant={statusVariant[deal.status] || 'secondary'} className="text-base px-4 py-2">{deal.status}</Badge>
        </PageHeader>
        <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Deal Details</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="font-medium">Client</div><div>{deal.clientName}</div>
                        <div className="font-medium">Principal Amount</div><div>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</div>
                        <div className="font-medium">Interest Rate</div><div>{deal.interestRate}%</div>
                        <div className="font-medium">Duration</div><div>{deal.durationValue} {deal.durationUnit}</div>
                        <div className="font-medium">Repayment Type</div><div>{deal.repaymentType}</div>
                        <div className="font-medium">Repayment Frequency</div><div>{deal.repaymentFrequency}</div>
                        <div className="font-medium">Date Created</div><div>{formatDate(deal.createdAt)}</div>
                    </CardContent>
                </Card>
                
                {deal.status === 'Pending' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserCheck className="h-5 w-5" />
                                <span>Eligible Investors</span>
                            </CardTitle>
                            <CardDescription>Investors with available fund batches whose tenure meets or exceeds the deal's duration.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Available Capital</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {eligibleInvestors.map(inv => (
                                        <TableRow key={inv.name}>
                                            <TableCell>{inv.name}</TableCell>
                                            <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(inv.totalAvailable)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {eligibleInvestors.length === 0 && <TableRow><TableCell colSpan={2} className="h-24 text-center">No eligible investors found.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            <span>Investors in this Deal</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Amount Invested</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {investorsInDeal.map(inv => (
                                    <TableRow key={inv.id}>
                                        <TableCell>{inv.investorName}</TableCell>
                                        <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(inv.amount)}</TableCell>
                                    </TableRow>
                                ))}
                                {investorsInDeal.length === 0 && <TableRow><TableCell colSpan={2} className="h-24 text-center">No investors yet.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            {/* Right Column */}
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /><span>Deal Funding</span></CardTitle>
                        <CardDescription>
                            {isFullyFunded ? "This deal has been fully funded." : "Automatically source funds from eligible capital to activate this deal."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2 text-sm">
                                <span className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalFunded)}</span>
                                <span className="text-muted-foreground">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</span>
                            </div>
                            <Progress value={fundingProgress} />
                        </div>
                        {deal.status === 'Pending' && (
                             <Button className="w-full" onClick={handleFundDeal} disabled={isPending || isFullyFunded}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4"/>}
                                {isFullyFunded ? 'Fully Funded' : 'Auto-Fund Deal'}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}
