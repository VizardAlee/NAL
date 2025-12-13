
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
import { FilePlus, Hourglass, History, FileText, Download, ArrowRight } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, writeBatch, doc, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname, useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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

// Hook to clear notifications when a page is visited
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
    isPendingTab,
}: {
    requests: DealRequest[],
    isLoading: boolean,
    isPendingTab: boolean,
}) {
    const isMobile = useIsMobile();
    const router = useRouter();

    const handleRowClick = (requestId: string) => {
        if(isPendingTab) {
            router.push(`/admin/approvals/deal-requests/${requestId}`);
        }
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
                    <Card key={request.id} onClick={() => handleRowClick(request.id)} className={isPendingTab ? 'cursor-pointer' : ''}>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-medium">{request.clientName}</p>
                                    <p className="text-sm text-primary font-bold">{request.dealName}</p>
                                    <p className="text-sm text-muted-foreground font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.principal)}</p>
                                    <p className="text-xs text-muted-foreground">{format(request.requestedAt.toDate(), 'PPP')}</p>
                                </div>
                                <Badge variant={request.status === 'Approved' ? 'default' : request.status === 'Rejected' ? 'destructive' : 'secondary'}>{request.status}</Badge>
                            </div>
                            <div className="flex justify-end items-center pt-2 border-t">
                                {isPendingTab ? (
                                    <Button variant="outline" size="sm">View Request <ArrowRight className="ml-2 h-4 w-4"/></Button>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Processed on {request.processedAt ? format(request.processedAt.toDate(), 'PPP') : 'N/A'}</span>
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
                            <TableHead>Status</TableHead>
                            {isPendingTab && <TableHead className="text-right">Action</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.map((request) => (
                            <TableRow key={request.id} onClick={() => handleRowClick(request.id)} className={isPendingTab ? 'cursor-pointer' : ''}>
                                <TableCell data-label="Client" className="font-medium">{request.clientName}</TableCell>
                                <TableCell data-label="Deal Name">{request.dealName}</TableCell>
                                <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(request.principal)}</TableCell>
                                <TableCell data-label="Date Requested">{format(request.requestedAt.toDate(), 'PPP')}</TableCell>
                                <TableCell data-label="Status">
                                    <Badge variant={request.status === 'Approved' ? 'default' : request.status === 'Rejected' ? 'destructive' : 'secondary'}>{request.status}</Badge>
                                </TableCell>
                                {isPendingTab && (
                                    <TableCell data-label="Actions" className="text-right">
                                        <Button variant="outline" size="sm">Review <ArrowRight className="ml-2 h-4 w-4"/></Button>
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
    useClearNotificationsByPath();

    const firestore = useFirestore();
    const pendingQuery = useMemo(() => firestore ? query(collection(firestore, 'dealRequests'), where('status', '==', 'Pending'), orderBy('requestedAt', 'asc')) : null, [firestore]);
    const processedQuery = useMemo(() => firestore ? query(collection(firestore, 'dealRequests'), where('status', 'in', ['Approved', 'Rejected']), orderBy('processedAt', 'desc')) : null, [firestore]);

    const { data: pendingRequests, loading: pendingLoading } = useCollection<DealRequest>(pendingQuery);
    const { data: processedRequests, loading: processedLoading } = useCollection<DealRequest>(processedQuery);

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
                        isPendingTab={true}
                    />
                </TabsContent>
                <TabsContent value="processed" className="mt-4">
                    <DealRequestsTable
                        requests={processedRequests || []}
                        isLoading={processedLoading}
                        isPendingTab={false}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
