
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal } from '@/lib/types';
import Link from "next/link";
import { RepaymentSchedule } from "./repayment-schedule";

export type Repayment = DocumentData & {
  id: string;
  dealId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  lodgedAt: Timestamp;
  dueDate: Timestamp; // Assuming we add this when lodging payment
};


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
                    <span className="font-bold">
                        {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}
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
            <div className="mt-auto flex-grow">
              <RepaymentSchedule deal={deal} allRepayments={allRepayments} repaymentsLoading={repaymentsLoading} />
            </div>
        </Card>
    )
}

function DealsSkeleton() {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
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
                        <Skeleton className="h-40 w-full mt-4" />
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
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid));
    }, [firestore, user]);

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid));
    }, [firestore, user]);


    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: allRepayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery);
    
    const isLoading = userLoading || dealsLoading;

    return (
        <div>
            <PageHeader
                title="My Deals"
                description="Here is an overview of your current and past financing deals."
                icon={FileText}
            />
            
            {isLoading ? (
                <DealsSkeleton />
            ) : deals && deals.length > 0 ? (
                 <div className="grid gap-8 lg:grid-cols-2">
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
