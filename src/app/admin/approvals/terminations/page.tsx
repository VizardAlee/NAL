
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
import { useState, useMemo } from 'react';
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
import { runOwnerProfitAllocationAction } from '@/app/admin/funds/actions';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { processTerminationRequestAction } from '@/app/admin/approvals/actions';

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
    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'terminationRequests'), where('status', '==', 'Pending')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'terminationRequests'), where('status', 'in', ['Approved', 'Rejected'])) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<TerminationRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<TerminationRequest>(processedQuery);

    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: TerminationRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        try {
            await processTerminationRequestAction({ authToken: await getRequiredIdToken(), requestId: request.id, decision: newStatus });

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
