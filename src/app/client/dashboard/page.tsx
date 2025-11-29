
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, PlusCircle, History } from "lucide-react";
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal } from '@/lib/types';
import { Naira } from "@/components/icons";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { format } from "date-fns";

type Repayment = DocumentData & {
  id: string;
  dealId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  lodgedAt: Timestamp;
};

function DealRepayments({ deal, allRepayments, repaymentsLoading }: { deal: Deal, allRepayments: Repayment[] | null, repaymentsLoading: boolean }) {

  const repaymentsForThisDeal = useMemo(() => {
    if (!allRepayments) return [];
    return allRepayments.filter(r => r.dealId === deal.id);
  }, [allRepayments, deal.id]);

  const totalRepaid = useMemo(() => {
    return repaymentsForThisDeal?.filter(r => r.status === 'Approved').reduce((sum, r) => sum + r.amount, 0) ?? 0;
  }, [repaymentsForThisDeal]);

  const outstandingPrincipal = useMemo(() => {
    // This is a simplified calculation. A real system would track this more precisely.
    return Math.max(0, deal.principal - totalRepaid);
  }, [deal.principal, totalRepaid]);

  const getRepaymentBreakdown = (repaymentAmount: number) => {
    // Simplified amortization: assumes repayment covers monthly interest first, then principal.
    // A more accurate calculation would need the outstanding principal at the time of repayment.
    const monthlyInterest = deal.principal * (deal.interestRate / 100) / 12;
    const profitPaid = Math.min(repaymentAmount, monthlyInterest);
    const principalPaid = repaymentAmount - profitPaid;
    return { principalPaid, profitPaid };
  };
  
  if (repaymentsLoading) {
    return <Skeleton className="h-24 w-full" />
  }

  if (!repaymentsForThisDeal || repaymentsForThisDeal.length === 0) {
    return <p className="text-sm text-muted-foreground px-6 pb-4">No repayments have been lodged for this deal yet.</p>;
  }

  return (
    <div className="px-6 pb-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" />
        Repayment History
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Profit</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repaymentsForThisDeal.map(repayment => {
            const { principalPaid, profitPaid } = getRepaymentBreakdown(repayment.amount);
            return (
              <TableRow key={repayment.id}>
                <TableCell>{format(repayment.lodgedAt.toDate(), 'PPP')}</TableCell>
                <TableCell><Badge variant={repayment.status === 'Approved' ? 'default' : 'secondary'}>{repayment.status}</Badge></TableCell>
                <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(principalPaid)}</TableCell>
                <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(profitPaid)}</TableCell>
                <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}


function DealCard({ deal, allRepayments, repaymentsLoading }: { deal: Deal, allRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
    const statusVariant = {
        Pending: 'secondary',
        Active: 'default',
        Completed: 'outline',
        Terminated: 'destructive',
    } as const;

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <CardTitle className="font-headline text-xl">{deal.dealName}</CardTitle>
                     <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                </div>
                <CardDescription>{deal.clientName}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
               <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <span className="text-sm text-muted-foreground">Principal Amount</span>
                    <span className="font-bold flex items-center gap-1">
                        <Naira className="h-4 w-4" />
                        {new Intl.NumberFormat('en-NG').format(deal.principal)}
                    </span>
               </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-muted-foreground">Interest Rate</p>
                        <p className="font-medium">{deal.interestRate}%</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-medium">{deal.durationValue} {deal.durationUnit}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Repayment</p>
                        <p className="font-medium">{deal.repaymentType}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Frequency</p>
                        <p className="font-medium">{deal.repaymentFrequency}</p>
                    </div>
                </div>
            </CardContent>
            <div className="mt-auto">
              <DealRepayments deal={deal} allRepayments={allRepayments} repaymentsLoading={repaymentsLoading} />
            </div>
        </Card>
    )
}

function DealsSkeleton() {
    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2 mt-2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-12 w-full" />
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}


export default function ClientDashboard() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();

    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        // Query for deals where the client's user ID matches.
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid));
    }, [firestore, user]);

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        // Query for all repayments belonging to the current client.
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid));
    }, [firestore, user]);


    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: allRepayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery);
    
    const isLoading = userLoading || dealsLoading || repaymentsLoading;

    return (
        <div>
            <PageHeader
                title="My Deals"
                description="Here is an overview of your current and past financing deals."
                icon={FileText}
            >
                <Button asChild>
                    <Link href="/client/lodge-payment">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Lodge Payment
                    </Link>
                </Button>
            </PageHeader>
            
            {isLoading ? (
                <DealsSkeleton />
            ) : deals && deals.length > 0 ? (
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {deals.map(deal => (
                        <DealCard key={deal.id} deal={deal} allRepayments={allRepayments} repaymentsLoading={repaymentsLoading} />
                    ))}
                </div>
            ) : (
                <Card className="mt-6 border-dashed">
                    <CardContent className="p-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No Deals Found</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            You do not have any financing deals yet. An admin will create one for you.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

    

    