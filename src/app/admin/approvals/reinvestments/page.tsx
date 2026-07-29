
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
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, writeBatch, doc, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { processReinvestmentRequestAction } from '@/app/admin/approvals/actions';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { Checkbox } from '@/components/ui/checkbox';

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
    onProcessRequest?: (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected', specialInvestment?: boolean) => void
}) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [specialRequestIds, setSpecialRequestIds] = useState<Set<string>>(new Set());
    const isMobile = useIsMobile();

    const handleProcessClick = (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        onProcessRequest?.(request, newStatus, specialRequestIds.has(request.id));
    };

    const setSpecial = (requestId: string, checked: boolean) => {
        setSpecialRequestIds((current) => {
            const next = new Set(current);
            if (checked) next.add(requestId);
            else next.delete(requestId);
            return next;
        });
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
                        <TableHead>Investor</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
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
                No reinvestment requests found in this category.
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
                                    <p className="font-medium">{request.investorName}</p>
                                    <p className="text-sm text-primary font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.amount)}</p>
                                    <p className="text-xs text-muted-foreground">{format(request.requestedAt.toDate(), 'PPP')}</p>
                                </div>
                                {!showActionButtons && <Badge variant={request.status === 'Approved' ? 'default' : 'destructive'}>{request.status}</Badge>}
                            </div>
                            {showActionButtons && (
                                <div className="space-y-3 pt-2 border-t">
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={specialRequestIds.has(request.id)}
                                            onCheckedChange={(checked) => setSpecial(request.id, checked === true)}
                                        />
                                        Special investment priority
                                    </label>
                                    <div className="flex justify-end gap-2">
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
                            <TableHead>Investor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date Requested</TableHead>
                            {showActionButtons && <TableHead>Priority</TableHead>}
                            {showActionButtons ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell data-label="Investor" className="font-medium">{request.investorName}</TableCell>
                                <TableCell data-label="Amount">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.amount)}</TableCell>
                                <TableCell data-label="Date Requested">{format(request.requestedAt.toDate(), 'PPP')}</TableCell>
                                {showActionButtons && (
                                    <TableCell data-label="Priority">
                                        <label className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={specialRequestIds.has(request.id)}
                                                onCheckedChange={(checked) => setSpecial(request.id, checked === true)}
                                            />
                                            Special
                                        </label>
                                    </TableCell>
                                )}
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

export default function ReinvestmentsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);
    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'reinvestmentRequests'), where('status', '==', 'Pending')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'reinvestmentRequests'), where('status', 'in', ['Approved', 'Rejected'])) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<ReinvestmentRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<ReinvestmentRequest>(processedQuery);
    
    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: ReinvestmentRequest, newStatus: 'Approved' | 'Rejected', specialInvestment = false) => {
        setProcessingId(request.id);
        try {
            await processReinvestmentRequestAction({ authToken: await getRequiredIdToken(), requestId: request.id, decision: newStatus, specialInvestment });

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
                <TabsList>
                    <TabsTrigger value="pending"><Hourglass className="mr-2 h-4 w-4" />Pending</TabsTrigger>
                    <TabsTrigger value="processed"><History className="mr-2 h-4 w-4" />Processed</TabsTrigger>
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
