
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
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

type ReinvestmentRequest = DocumentData & {
  id: string;
  investorId: string;
  investorName: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Timestamp;
  processedAt?: Timestamp;
};

function ReinvestmentsTable({
    requests,
    isLoading,
    showActionButtons,
    onProcessRequest
}: {
    requests: ReinvestmentRequest[],
    isLoading: boolean,
    showActionButtons: boolean,
    onProcessRequest?: (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected') => void
}) {
    const [processingId, setProcessingId] = useState<string | null>(null);

    const handleProcessClick = (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        onProcessRequest?.(request, newStatus);
    };

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Investor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date Requested</TableHead>
                            {showActionButtons ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading &&
                            Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                                </TableRow>
                            ))}
                        {!isLoading && requests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell className="font-medium">{request.investorName}</TableCell>
                                <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.amount)}</TableCell>
                                <TableCell>{format(request.requestedAt.toDate(), 'PPP')}</TableCell>
                                {showActionButtons ? (
                                    <TableCell className="text-right space-x-2">
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
                                    <TableCell>
                                        <Badge variant={request.status === 'Approved' ? 'default' : 'destructive'}>{request.status}</Badge>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                        {!isLoading && requests.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No reinvestment requests found in this category.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export default function ReinvestmentsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);

    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'reinvestmentRequests'), where('status', '==', 'Pending')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'reinvestmentRequests'), where('status', 'in', ['Approved', 'Rejected'])) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<ReinvestmentRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<ReinvestmentRequest>(processedQuery);
    
    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected') => {
        if (!firestore) return;
        setProcessingId(request.id);
        
        try {
            const batch = writeBatch(firestore);
            const requestRef = doc(firestore, 'reinvestmentRequests', request.id);

            batch.update(requestRef, {
                status: newStatus,
                processedAt: Timestamp.now()
            });

            if (newStatus === 'Approved') {
                const timestamp = Timestamp.now();
                
                // 1. Create a "Withdrawal" transaction to zero out the profit from the withdrawable balance
                const withdrawalTxRef = doc(collection(firestore, 'transactions'));
                batch.set(withdrawalTxRef, {
                    userId: request.investorId,
                    type: 'Withdrawal',
                    amount: -request.amount, // Negative to subtract from balance
                    createdAt: timestamp,
                    details: 'Profit Reinvestment',
                });

                // 2. Create a new "Deposit" transaction for the reinvested amount as new capital
                const depositTxRef = doc(collection(firestore, 'transactions'));
                batch.set(depositTxRef, {
                    userId: request.investorId,
                    type: 'Deposit',
                    amount: request.amount,
                    createdAt: timestamp,
                    details: 'Profit Reinvestment',
                });

                // 3. Create a new fundBatch for the reinvested amount
                const fundBatchRef = doc(collection(firestore, 'fundBatches'));
                batch.set(fundBatchRef, {
                    sourceId: request.investorId,
                    amount: request.amount,
                    remainingAmount: request.amount,
                    createdAt: timestamp,
                    // A default tenure is set here. In a more complex app, this could be configurable.
                    tenureValue: 10, 
                    tenureUnit: 'Years',
                });
            }

            await batch.commit();

            toast({
                title: `Request ${newStatus}`,
                description: `${request.investorName}'s reinvestment request has been ${newStatus.toLowerCase()}.`
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
                title="Reinvestment Approvals"
                description="Review and approve investor requests to reinvest their profits."
                icon={CheckCircle}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="processed">Processed</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <ReinvestmentsTable
                        requests={pendingRequests || []}
                        isLoading={pendingLoading}
                        showActionButtons={true}
                        onProcessRequest={handleProcessRequest}
                    />
                </TabsContent>
                <TabsContent value="processed" className="mt-4">
                    <ReinvestmentsTable
                        requests={processedRequests || []}
                        isLoading={processedLoading}
                        showActionButtons={false}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
