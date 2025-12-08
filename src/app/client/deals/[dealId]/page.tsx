

'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldAlert, Loader2, HandCoins } from "lucide-react";
import { useMemo, useTransition } from 'react';
import { useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, Timestamp, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal, Repayment } from '@/lib/types';
import { ClientRepaymentSchedule } from "../../dashboard/client-repayment-schedule";
import { RepaymentHistory } from "@/components/deals/repayment-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestTerminationAction } from "../../dashboard/actions";
import { notFound, useParams } from "next/navigation";
import { ViewPageNav } from "@/components/view-page-nav";


const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
} as const;

function DealDetailSkeleton() {
    return (
        <div>
            <PageHeader title="Loading Deal..." description="Please wait while we fetch the details." icon={FileText} />
             <Card>
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
        </div>
    )
}

export default function ClientDealDetailPage() {
    const { dealId } = useParams<{ dealId: string }>();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPendingTermination, startTransition] = useTransition();

    const dealRef = useMemo(() => {
        if (!firestore || !dealId) return null;
        return doc(firestore, 'deals', dealId);
    }, [firestore, dealId]);

    const { data: deal, loading: dealLoading } = useDoc<Deal>(dealRef as any);

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid), where('dealId', '==', dealId));
    }, [firestore, user, dealId]);

    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery as any);

    const lodgedRepayments = useMemo(() => {
        if (!repayments) return [];
        return repayments.filter(r => r.status === 'Pending' || r.status === 'Approved');
    }, [repayments]);

    const handleTerminationRequest = () => {
        if (!user || !user.displayName || !deal) return;
        startTransition(async () => {
            const result = await requestTerminationAction({
              dealId: deal.id,
              dealName: deal.dealName,
              clientId: user.uid,
              clientName: user.displayName!
            });
            if (result.success) {
                toast({
                    title: "Request Sent",
                    description: result.message
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Request Failed",
                    description: result.message
                });
            }
        });
    }

    if (dealLoading) {
        return <DealDetailSkeleton />;
    }

    if (!deal) {
        return notFound();
    }

    return (
        <div>
            <PageHeader title={deal.dealName} icon={FileText}>
                <ViewPageNav homePath="/client/dashboard" />
            </PageHeader>
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
                            <p className="text-muted-foreground">Profit Rate</p>
                            <p className="font-medium">{deal.profitRate}%</p>
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
                     <div className="flex items-center justify-between p-3 rounded-md border text-sm">
                        <div className="flex items-center gap-2">
                            <HandCoins className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Management Fee</span>
                        </div>
                        <span className="font-medium">
                            {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.managementFeeAmount || 0)}
                            <span className="text-xs text-muted-foreground"> ({deal.managementFeeRate || 0}%)</span>
                        </span>
                    </div>
                    {deal.status === 'Active' && (
                        <Button variant="destructive" size="sm" onClick={handleTerminationRequest} disabled={isPendingTermination}>
                            {isPendingTermination ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                            Request Termination
                        </Button>
                    )}
                </CardContent>
                <div className="mt-auto flex-grow">
                    <Tabs defaultValue="schedule" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="schedule">Upcoming Schedule</TabsTrigger>
                            <TabsTrigger value="history">Repayment History</TabsTrigger>
                        </TabsList>
                        <TabsContent value="schedule">
                            <ClientRepaymentSchedule deal={deal} initialRepayments={repayments} repaymentsLoading={repaymentsLoading} />
                        </TabsContent>
                        <TabsContent value="history">
                            <RepaymentHistory repayments={lodgedRepayments} loading={repaymentsLoading} />
                        </TabsContent>
                    </Tabs>
                </div>
            </Card>
        </div>
    )
}
