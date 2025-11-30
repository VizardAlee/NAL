
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldAlert, Loader2, ArrowRight } from "lucide-react";
import { useMemo, useTransition } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal } from '@/lib/types';
import { RepaymentSchedule } from "./repayment-schedule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepaymentHistory } from "./repayment-history";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestTerminationAction } from "./actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";


export type Repayment = DocumentData & {
  id: string;
  dealId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  lodgedAt: Timestamp;
  dueDate: Timestamp;
};

const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
} as const;


function DealCard({ deal }: { deal: Deal }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPendingTermination, startTransition] = useTransition();

    const repaymentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'repayments'), where('clientId', '==', user.uid), where('dealId', '==', deal.id));
    }, [firestore, user, deal.id]);

    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery as any);

    const lodgedRepayments = useMemo(() => {
        if (!repayments) return [];
        return repayments.filter(r => r.status === 'Pending' || r.status === 'Approved');
    }, [repayments]);

    const handleTerminationRequest = () => {
        if (!user || !user.displayName) return;
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
                        <RepaymentSchedule deal={deal} initialRepayments={repayments} repaymentsLoading={repaymentsLoading} />
                    </TabsContent>
                    <TabsContent value="history">
                        <RepaymentHistory repayments={lodgedRepayments} loading={repaymentsLoading} />
                    </TabsContent>
                </Tabs>
            </div>
        </Card>
    )
}

function DealsSkeleton() {
    return (
        <div>
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


export default function ClientDashboard() {
    const firestore = useFirestore();
    const router = useRouter();
    const { user, loading: userLoading } = useUser();

    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user]);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    
    const isLoading = userLoading || dealsLoading;

    const mostRecentDeal = useMemo(() => deals?.[0], [deals]);
    const olderDeals = useMemo(() => deals?.slice(1) || [], [deals]);

    return (
        <div>
            <PageHeader
                title="My Deals"
                description="Here is an overview of your current and past financing deals."
                icon={FileText}
            />
            
            {isLoading ? (
                <DealsSkeleton />
            ) : mostRecentDeal ? (
                <div className="grid gap-8">
                    <DealCard deal={mostRecentDeal} />

                    {olderDeals.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Previous Deals</CardTitle>
                                <CardDescription>A history of your past financing deals.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Deal Name</TableHead>
                                            <TableHead>Principal</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {olderDeals.map(deal => (
                                            <TableRow key={deal.id}>
                                                <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
                                                <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                                <TableCell data-label="Status">
                                                    <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                                                </TableCell>
                                                <TableCell data-label="Action" className="text-right">
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/client/deals/${deal.id}`}>
                                                            View Details <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
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
