
'use client';

import { useMemo, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FileText, Users, Landmark, Handshake } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Deal } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AddInvestmentForm } from './add-investment-form';

type Investment = DocumentData & {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  createdAt: Timestamp;
};

// We need user data to display investor names
type User = {
    id: string;
    name: string;
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
  const [isInvestDialogOpen, setInvestDialogOpen] = useState(false);

  const dealRef = useMemo(() => {
    if (!firestore || !dealId) return null;
    return doc(firestore, 'deals', dealId) as doc<Deal>;
  }, [firestore, dealId]);

  const investmentsQuery = useMemo(() => {
    if (!firestore || !dealId) return null;
    return query(collection(firestore, 'investments'), where('dealId', '==', dealId));
  }, [firestore, dealId]);
  
  // We need to fetch all users to map investor IDs to names.
  // In a larger app, this might be optimized, but it's fine for now.
  const usersQuery = useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: deal, loading: dealLoading } = useDoc<Deal>(dealRef);
  const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);
  const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

  const isLoading = dealLoading || investmentsLoading || usersLoading;

  const investorsInDeal = useMemo(() => {
    if (!investments || !users) return [];
    return investments.map(inv => {
        const user = users.find(u => u.id === inv.investorId);
        return {
            ...inv,
            investorName: user?.name || 'Unknown Investor'
        }
    });
  }, [investments, users]);

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
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            <span>Investors</span>
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
                        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /><span>Manage Investments</span></CardTitle>
                        <CardDescription>Allocate investor funds to this deal.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Dialog open={isInvestDialogOpen} onOpenChange={setInvestDialogOpen}>
                            <DialogTrigger asChild><Button className="w-full"><Handshake className="mr-2 h-4 w-4"/>Add Investment</Button></DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Invest in: {deal.dealName}</DialogTitle>
                                </DialogHeader>
                                <AddInvestmentForm dealId={dealId} dealName={deal.dealName} onInvestmentAdded={() => setInvestDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}
