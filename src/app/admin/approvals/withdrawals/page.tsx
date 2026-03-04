
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
import { CheckCircle, Loader2, XCircle, Hourglass, History } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, writeBatch, doc, getDocs, orderBy, increment, getDoc, runTransaction } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';


type WithdrawalRequest = DocumentData & {
    id: string;
    investorId?: string;
    userId?: string;        // fallback field used by old owner requests
    investorName?: string;
    amount: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: Timestamp;
    processedAt?: Timestamp;
    type?: 'OwnerWithdrawal' | 'InvestorWithdrawal';
};


function WithdrawalsTable({
    requests,
    isLoading,
    showActionButtons,
    onProcessRequest
}: {
    requests: WithdrawalRequest[],
    isLoading: boolean,
    showActionButtons: boolean,
    onProcessRequest?: (request: WithdrawalRequest, newStatus: 'Approved' | 'Rejected') => void
}) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const handleProcessClick = (request: WithdrawalRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        onProcessRequest?.(request, newStatus);
    };

    if (isLoading) {
        if (isMobile) {
            return (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full" />
                    ))}
                </div>
            );
        }
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Requester</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
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
                No withdrawal requests found in this category.
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
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium">{request.investorName || 'N/A'}</p>
                                        <Badge variant={request.type === 'OwnerWithdrawal' ? 'secondary' : 'outline'} className="text-[10px] py-0">
                                            {request.type === 'OwnerWithdrawal' ? 'Owner' : 'Investor'}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-primary font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.amount)}</p>
                                    <p className="text-xs text-muted-foreground">{request.requestedAt ? format(request.requestedAt.toDate(), 'PPP') : 'N/A'}</p>
                                </div>
                                {!showActionButtons && <Badge variant={request.status === 'Approved' ? 'default' : request.status === 'Rejected' ? 'destructive' : 'secondary'}>{request.status}</Badge>}
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
        )
    }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Requester</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date Requested</TableHead>
                            {showActionButtons ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!isLoading && requests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell data-label="Requester" className="font-medium">{request.investorName || 'N/A'}</TableCell>
                                <TableCell data-label="Type">
                                    <Badge variant={request.type === 'OwnerWithdrawal' ? 'secondary' : 'outline'}>
                                        {request.type === 'OwnerWithdrawal' ? 'Owner' : 'Investor'}
                                    </Badge>
                                </TableCell>
                                <TableCell data-label="Amount">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.amount)}</TableCell>
                                <TableCell data-label="Date Requested">{request.requestedAt ? format(request.requestedAt.toDate(), 'PPP') : 'N/A'}</TableCell>
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
                                        <Badge variant={request.status === 'Approved' ? 'default' : request.status === 'Rejected' ? 'destructive' : 'secondary'}>{request.status}</Badge>
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

export default function WithdrawalsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);


    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'withdrawalRequests'), where('status', '==', 'Pending')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'withdrawalRequests'), where('status', 'in', ['Approved', 'Rejected']), orderBy('requestedAt', 'desc')) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<WithdrawalRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<WithdrawalRequest>(processedQuery);

    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: WithdrawalRequest, newStatus: 'Approved' | 'Rejected') => {
        if (!firestore) return;
        setProcessingId(request.id);

        try {
            await runTransaction(firestore, async (transaction) => {
                const requestRef = doc(firestore, 'withdrawalRequests', request.id);
                const requestDoc = await transaction.get(requestRef);

                if (!requestDoc.exists()) {
                    throw new Error("Withdrawal request not found.");
                }

                if (requestDoc.data().status !== 'Pending') {
                    throw new Error("This request has already been processed.");
                }

                transaction.update(requestRef, {
                    status: newStatus,
                    processedAt: Timestamp.now()
                });

                if (newStatus === 'Approved') {
                    const resolvedUserId = request.investorId || request.userId;
                    if (!resolvedUserId) throw new Error('Cannot determine user ID for this withdrawal request.');

                    // 1. Create the negative transaction
                    const transactionRef = doc(collection(firestore, 'transactions'));
                    transaction.set(transactionRef, {
                        userId: resolvedUserId,
                        type: 'Withdrawal',
                        amount: -Math.abs(request.amount),
                        createdAt: Timestamp.now(),
                    });

                    // 2. Deduct from fund batches FIFO
                    const batchesQuery = query(
                        collection(firestore, 'fundBatches'),
                        where('sourceId', '==', resolvedUserId),
                        where('remainingAmount', '>', 0),
                        orderBy('createdAt', 'asc')
                    );

                    const batchesSnap = await getDocs(batchesQuery);
                    let remainingToDeduct = Math.abs(request.amount);

                    for (const batchDoc of batchesSnap.docs) {
                        if (remainingToDeduct <= 0) break;
                        const batchData = batchDoc.data();
                        const available = batchData.remainingAmount;
                        const deduction = Math.min(available, remainingToDeduct);

                        transaction.update(batchDoc.ref, {
                            remainingAmount: increment(-deduction)
                        });
                        remainingToDeduct -= deduction;
                    }

                    if (remainingToDeduct > 0.01) {
                        throw new Error(`Insufficient investible balance. Could not deduct full withdrawal amount (Remaining: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(remainingToDeduct)}).`);
                    }
                }
            });

            toast({
                title: `Request ${newStatus}`,
                description: `${request.investorName}'s withdrawal request has been ${newStatus.toLowerCase()}.`
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
                title="Withdrawal Approvals"
                description="Review and approve/reject withdrawal requests from investors and owners."
                icon={CheckCircle}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList>
                    <TabsTrigger value="pending"><Hourglass className="mr-2 h-4 w-4" />Pending</TabsTrigger>
                    <TabsTrigger value="processed"><History className="mr-2 h-4 w-4" />Processed</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <WithdrawalsTable
                        requests={pendingRequests || []}
                        isLoading={pendingLoading}
                        showActionButtons={true}
                        onProcessRequest={handleProcessRequest}
                    />
                </TabsContent>
                <TabsContent value="processed" className="mt-4">
                    <WithdrawalsTable
                        requests={processedRequests || []}
                        isLoading={processedLoading}
                        showActionButtons={false}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
