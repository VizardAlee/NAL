
'use client';

import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, XCircle, ShieldAlert, Hourglass, History } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, runTransaction, doc, writeBatch, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { Deal } from '@/lib/types';
import { Investment } from '@/lib/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';

type TerminationRequest = DocumentData & {
  id: string;
  clientId: string;
  clientName: string;
  dealId: string;
  dealName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  platformEarning?: number;
};

// New hook to clear notifications when a page is visited
function useClearNotificationsByPath() {
    const firestore = useFirestore();
    const pathname = usePathname();
    const { user } = useUser();

    useEffect(() => {
        if (!firestore || !pathname || !user) return;

        const clearNotifications = async () => {
            try {
                const notificationsToClearQuery = query(
                    collection(firestore, 'notifications'),
                    where('recipientId', '==', user.uid),
                    where('link', '==', pathname),
                    where('read', '==', false)
                );
                
                const snapshot = await getDocs(notificationsToClearQuery);
                if (snapshot.empty) return;

                const batch = writeBatch(firestore);
                snapshot.docs.forEach(doc => {
                    batch.update(doc.ref, { read: true });
                });
                
                await batch.commit();
            } catch (error) {
                console.error("Failed to clear notifications:", error);
            }
        };

        const timer = setTimeout(clearNotifications, 500);
        return () => clearTimeout(timer);

    }, [firestore, pathname, user]);
}

function TerminationsTable({
    requests,
    isLoading,
    showActionButtons,
    onProcessRequest
}: {
    requests: TerminationRequest[],
    isLoading: boolean,
    showActionButtons: boolean,
    onProcessRequest?: (request: TerminationRequest, newStatus: 'Approved' | 'Rejected') => void
}) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const handleProcessClick = (request: TerminationRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        onProcessRequest?.(request, newStatus);
    };

    if (isLoading) {
        if (isMobile) {
            return (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-36 w-full" />
                    ))}
                </div>
            );
        }
        return (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Deal</TableHead>
                        <TableHead>Date Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    if (requests.length === 0) {
        return (
             <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
                No termination requests found in this category.
            </div>
        );
    }
    
    if (isMobile) {
        return (
            <div className="space-y-3">
                {requests.map((request) => (
                    <Card key={request.id}>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-medium">{request.clientName}</p>
                                    <p className="text-sm text-primary font-bold">{request.dealName}</p>
                                    <p className="text-xs text-muted-foreground">{format(request.requestedAt.toDate(), 'PPP')}</p>
                                </div>
                                {!showActionButtons && <Badge variant={request.status === 'Approved' ? 'default' : 'destructive'}>{request.status}</Badge>}
                            </div>
                            {showActionButtons && (
                                <div className="flex justify-end gap-2 pt-2 border-t">
                                     <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleProcessClick(request, 'Rejected')}
                                        disabled={processingId === request.id}
                                    >
                                        {processingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                        Reject
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleProcessClick(request, 'Approved')}
                                        disabled={processingId === request.id}
                                    >
                                        {processingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                        Approve
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Deal</TableHead>
                            <TableHead>Date Requested</TableHead>
                            {showActionButtons ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell data-label="Client" className="font-medium">{request.clientName}</TableCell>
                                <TableCell data-label="Deal">{request.dealName}</TableCell>
                                <TableCell data-label="Date Requested">{format(request.requestedAt.toDate(), 'PPP')}</TableCell>
                                {showActionButtons ? (
                                    <TableCell data-label="Actions" className="text-right space-x-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleProcessClick(request, 'Rejected')}
                                            disabled={processingId === request.id}
                                        >
                                            {processingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                            Reject
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleProcessClick(request, 'Approved')}
                                            disabled={processingId === request.id}
                                        >
                                            {processingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                            Approve
                                        </Button>
                                    </TableCell>
                                ) : (
                                    <TableCell data-label="Status">
                                        <Badge variant={request.status === 'Approved' ? 'default' : 'destructive'}>{request.status}</Badge>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export default function TerminationsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);

    useClearNotificationsByPath();

    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'terminationRequests'), where('status', '==', 'Pending')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'terminationRequests'), where('status', 'in', ['Approved', 'Rejected'])) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<TerminationRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<TerminationRequest>(processedQuery);
    
    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: TerminationRequest, newStatus: 'Approved' | 'Rejected') => {
        if (!firestore) return;
        setProcessingId(request.id);
        
        try {
            if (newStatus === 'Rejected') {
                const requestRef = doc(firestore, 'terminationRequests', request.id);
                await writeBatch(firestore).update(requestRef, { status: 'Rejected', processedAt: Timestamp.now() }).commit();
                toast({ title: "Request Rejected", description: `Termination request for "${request.dealName}" has been rejected.` });
                setProcessingId(null);
                return;
            }

            // --- Complex Approval Logic ---
            await runTransaction(firestore, async (transaction) => {
                const dealRef = doc(firestore, 'deals', request.dealId);
                const dealDoc = await transaction.get(dealRef);
                if (!dealDoc.exists()) throw new Error("Deal not found.");
                
                const deal = { ...dealDoc.data(), id: dealDoc.id } as Deal;
                const now = Timestamp.now();
                
                let finalInterest = 0;
                let remainingPrincipal = 0;
                
                // 1. Calculate final profit and principal based on repayment type
                if (deal.repaymentType === 'Balloon Payment') {
                    // For balloon, pay interest for the current period and return full principal
                    const schedule = generateAmortizationSchedule(deal);
                    const finalInstallment = schedule.find(inst => inst.dueDate >= now) || schedule[schedule.length - 1];
                    finalInterest = finalInstallment ? finalInstallment.interest : 0;
                    remainingPrincipal = deal.principal; // Always return full principal
                } else { // Equal Installments
                    const schedule = generateAmortizationSchedule(deal);
                    const finalInstallment = schedule.find(inst => inst.dueDate >= now) || schedule[schedule.length - 1];
                    if (finalInstallment) {
                        finalInterest = finalInstallment.interest;
                        // For equal installments, remaining principal is the balance *before* this payment
                        remainingPrincipal = finalInstallment.balance + finalInstallment.principal;
                    }
                }

                // 2. Distribute final interest profit if any
                if (finalInterest > 0) {
                    const investmentsQuery = query(collection(firestore, 'investments'), where('dealId', '==', deal.id));
                    const investmentsSnapshot = await getDocs(investmentsQuery); // Use getDocs inside transaction
                    const investments = investmentsSnapshot.docs.map(d => ({ ...d.data(), id: d.id })) as Investment[];
                    
                    if (investments.length > 0) {
                        const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);

                        for (const investment of investments) {
                            const investorProportion = investment.amount / totalInvested;
                            const investorProfit = finalInterest * investorProportion * 0.40; // 40% to investor
                            
                            const profitTxRef = doc(collection(firestore, 'transactions'));
                            transaction.set(profitTxRef, {
                                userId: investment.investorId,
                                dealId: deal.id,
                                type: 'ProfitDistribution',
                                amount: investorProfit,
                                createdAt: now,
                                dealName: deal.dealName,
                                details: 'Final profit on early termination'
                            });
                        }
                    }

                    // Platform Earning Transaction & Batching
                     const platformProfit = finalInterest * 0.60;
                     const platformTxRef = doc(collection(firestore, 'transactions'));
                     transaction.set(platformTxRef, {
                        userId: 'platform',
                        dealId: deal.id,
                        type: 'PlatformEarning',
                        amount: platformProfit,
                        createdAt: now,
                        dealName: deal.dealName,
                        details: 'Platform share on early termination'
                     });
                     
                     const platformFundBatchRef = doc(collection(firestore, 'fundBatches'));
                     transaction.set(platformFundBatchRef, {
                        sourceId: 'platform',
                        amount: platformProfit,
                        remainingAmount: platformProfit,
                        createdAt: now,
                        tenureValue: 10,
                        tenureUnit: 'Years',
                     });
                }

                // 3. Return remaining principal
                if (remainingPrincipal > 0) {
                     const investmentsQuery = query(collection(firestore, 'investments'), where('dealId', '==', deal.id));
                     const investmentsSnapshot = await getDocs(investmentsQuery);
                     const investments = investmentsSnapshot.docs.map(d => ({ ...d.data(), id: d.id })) as Investment[];
                     
                     if (investments.length > 0) {
                        const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);

                        for (const investment of investments) {
                            const investorProportion = investment.amount / totalInvested;
                            const principalToReturn = remainingPrincipal * investorProportion;

                            const fundBatchRef = doc(collection(firestore, 'fundBatches'));
                            transaction.set(fundBatchRef, {
                                sourceId: investment.investorId,
                                amount: principalToReturn,
                                remainingAmount: principalToReturn,
                                createdAt: now,
                                tenureValue: 10, // Default long tenure for returned principal
                                tenureUnit: 'Years',
                                details: `Returned principal from terminated deal: ${deal.dealName}`
                            });
                        }
                     }
                }
                
                // 4. Nullify pending repayments for this deal
                const repaymentsQuery = query(collection(firestore, 'repayments'), where('dealId', '==', deal.id), where('status', '==', 'Pending'));
                const repaymentsSnapshot = await getDocs(repaymentsQuery);
                repaymentsSnapshot.forEach(repaymentDoc => {
                    transaction.update(repaymentDoc.ref, { status: 'Cancelled' });
                });

                // 5. Update deal and request status
                transaction.update(dealRef, { status: 'Terminated' });
                const requestRef = doc(firestore, 'terminationRequests', request.id);
                transaction.update(requestRef, { 
                    status: 'Approved', 
                    processedAt: now,
                    platformEarning: finalInterest * 0.60,
                });
            });

            toast({
                title: `Request Approved`,
                description: `Deal "${request.dealName}" has been terminated.`,
            });

        } catch (error) {
            console.error("Processing Error: ", error);
            toast({
                variant: 'destructive',
                title: "Processing Failed",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div>
            <PageHeader
                title="Termination Approvals"
                description="Review and process client requests to terminate deals."
                icon={ShieldAlert}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList>
                    <TabsTrigger value="pending"><Hourglass className="mr-2 h-4 w-4" />Pending</TabsTrigger>
                    <TabsTrigger value="processed"><History className="mr-2 h-4 w-4" />Processed</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <TerminationsTable
                        requests={pendingRequests || []}
                        isLoading={pendingLoading}
                        showActionButtons={true}
                        onProcessRequest={handleProcessRequest}
                    />
                </TabsContent>
                <TabsContent value="processed" className="mt-4">
                    <TerminationsTable
                        requests={processedRequests || []}
                        isLoading={processedLoading}
                        showActionButtons={false}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
