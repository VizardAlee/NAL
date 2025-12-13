
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
import { CheckCircle, Loader2, XCircle, FilePlus, Hourglass, History, FileText, Download } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, writeBatch, doc, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

type DealRequest = DocumentData & {
  id: string;
  clientId: string;
  clientName: string;
  dealName: string;
  principal: number;
  profitRate: number;
  durationValue: number;
  durationUnit: string;
  repaymentType: string;
  repaymentFrequency: string;
  proposalDetails?: string;
  proposalPdf?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Timestamp;
  processedAt?: Timestamp;
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


function DealRequestsTable({
    requests,
    isLoading,
    showActionButtons,
    onProcessRequest
}: {
    requests: DealRequest[],
    isLoading: boolean,
    showActionButtons: boolean,
    onProcessRequest?: (request: DealRequest, newStatus: 'Approved' | 'Rejected') => void
}) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const handleProcessClick = (request: DealRequest, newStatus: 'Approved' | 'Rejected') => {
        setProcessingId(request.id);
        onProcessRequest?.(request, newStatus);
    };

    if (isLoading) {
        if (isMobile) {
            return (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-40 w-full" />
                    ))}
                </div>
            );
        }
        return (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Deal Name</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Date Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
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
                No deal requests found in this category.
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
                                    <p className="text-sm text-muted-foreground font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.principal)}</p>
                                    <p className="text-xs text-muted-foreground">{format(request.requestedAt.toDate(), 'PPP')}</p>
                                </div>
                                {!showActionButtons && <Badge variant={request.status === 'Approved' ? 'default' : 'destructive'}>{request.status}</Badge>}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t flex-wrap gap-2">
                                <div className="flex gap-2">
                                    {request.proposalDetails && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" />View Summary</Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>{request.dealName} - Deal Proposal Summary</DialogTitle>
                                                    <DialogDescription>Submitted by {request.clientName}</DialogDescription>
                                                </DialogHeader>
                                                <ScrollArea className="h-96">
                                                    <p className="whitespace-pre-wrap p-4">{request.proposalDetails}</p>
                                                </ScrollArea>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                     {request.proposalPdf && (
                                        <Button variant="outline" size="sm" asChild>
                                            <a href={request.proposalPdf} target="_blank" rel="noopener noreferrer" download={`${request.dealName}-proposal.pdf`}>
                                                <Download className="mr-2 h-4 w-4" />
                                                View PDF
                                            </a>
                                        </Button>
                                    )}
                                </div>
                                {showActionButtons && (
                                    <div className="flex justify-end gap-2 flex-1">
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
                            </div>
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
                            <TableHead>Deal Name</TableHead>
                            <TableHead>Principal</TableHead>
                            <TableHead>Date Requested</TableHead>
                            <TableHead>Deal Proposal</TableHead>
                            {showActionButtons ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell data-label="Client" className="font-medium">{request.clientName}</TableCell>
                                <TableCell data-label="Deal Name">{request.dealName}</TableCell>
                                <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.principal)}</TableCell>
                                <TableCell data-label="Date Requested">{format(request.requestedAt.toDate(), 'PPP')}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        {request.proposalDetails ? (
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" />Summary</Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-2xl">
                                                    <DialogHeader>
                                                        <DialogTitle>{request.dealName} - Deal Proposal Summary</DialogTitle>
                                                        <DialogDescription>Submitted by {request.clientName}</DialogDescription>
                                                    </DialogHeader>
                                                    <ScrollArea className="h-96">
                                                        <p className="whitespace-pre-wrap p-4">{request.proposalDetails}</p>
                                                    </ScrollArea>
                                                </DialogContent>
                                            </Dialog>
                                        ) : null}
                                        {request.proposalPdf && (
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={request.proposalPdf} target="_blank" rel="noopener noreferrer" download={`${request.dealName}-proposal.pdf`}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    PDF
                                                </a>
                                            </Button>
                                        )}
                                        {!request.proposalDetails && !request.proposalPdf && (
                                             <span className="text-muted-foreground text-xs">N/A</span>
                                        )}
                                    </div>
                                </TableCell>
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

export default function DealRequestsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);

    useClearNotificationsByPath();

    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'dealRequests'), where('status', '==', 'Pending'), orderBy('requestedAt', 'asc')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'dealRequests'), where('status', 'in', ['Approved', 'Rejected']), orderBy('processedAt', 'desc')) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<DealRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<DealRequest>(processedQuery);
    
    const isLoading = pendingLoading || processedLoading;

    const handleProcessRequest = async (request: DealRequest, newStatus: 'Approved' | 'Rejected') => {
        if (!firestore) return;
        setProcessingId(request.id);
        
        try {
            const batch = writeBatch(firestore);
            const requestRef = doc(firestore, 'dealRequests', request.id);

            batch.update(requestRef, {
                status: newStatus,
                processedAt: Timestamp.now()
            });
            
            if (newStatus === 'Approved') {
                const newDealData = {
                    dealName: request.dealName,
                    clientId: request.clientId,
                    clientName: request.clientName,
                    principal: request.principal,
                    profitRate: request.profitRate,
                    durationValue: request.durationValue,
                    durationUnit: request.durationUnit,
                    repaymentType: request.repaymentType,
                    repaymentFrequency: request.repaymentFrequency,
                    status: 'Pending', // New deals start as 'Pending' until funded
                    createdAt: Timestamp.now(),
                    startDate: Timestamp.now(),
                };
                const newDealRef = doc(collection(firestore, 'deals'));
                batch.set(newDealRef, newDealData);
            }

            await batch.commit();

            toast({
                title: `Request ${newStatus}`,
                description: `Deal request "${request.dealName}" has been ${newStatus.toLowerCase()}.`
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
                title="Deal Requests"
                description="Review and approve client requests for new financing deals."
                icon={FilePlus}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList>
                    <TabsTrigger value="pending"><Hourglass className="mr-2 h-4 w-4" />Pending</TabsTrigger>
                    <TabsTrigger value="processed"><History className="mr-2 h-4 w-4" />Processed</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <DealRequestsTable
                        requests={pendingRequests || []}
                        isLoading={pendingLoading}
                        showActionButtons={true}
                        onProcessRequest={handleProcessRequest}
                    />
                </TabsContent>
                <TabsContent value="processed" className="mt-4">
                    <DealRequestsTable
                        requests={processedRequests || []}
                        isLoading={processedLoading}
                        showActionButtons={false}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
