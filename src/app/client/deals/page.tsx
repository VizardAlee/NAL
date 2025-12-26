
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight } from "lucide-react";
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Deal } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { ViewPageNav } from "@/components/view-page-nav";


const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
} as const;

export default function ClientAllDealsPage() {
    const firestore = useFirestore();
    const router = useRouter();
    const { user, loading: userLoading } = useUser();
    const isMobile = useIsMobile();

    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user?.uid]);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery as any);
    
    const isLoading = userLoading || dealsLoading;

    if (isLoading) {
        return (
            <div>
                <PageHeader title="All My Deals" description="A complete history of your financing deals." icon={FileText} />
                <Skeleton className="h-96 w-full" />
            </div>
        )
    }

    return (
        <div>
            <PageHeader
                title="All My Deals"
                description="A complete history of your financing deals."
                icon={FileText}
            >
                <ViewPageNav homePath="/client/dashboard" />
            </PageHeader>
            
            {!deals || deals.length === 0 ? (
                <Card className="mt-6 border-dashed">
                    <CardContent className="p-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No Deals Found</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            You have not created any deals yet.
                        </p>
                    </CardContent>
                </Card>
            ) : isMobile ? (
                <div className="space-y-3">
                    {deals.map(deal => (
                        <Card key={deal.id} onClick={() => router.push(`/client/deals/${deal.id}`)} className="cursor-pointer">
                            <CardContent className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <p className="font-medium">{deal.dealName}</p>
                                    <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                                </div>
                                <div className="text-sm font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</div>
                                <p className="text-xs text-muted-foreground">Created: {format(deal.createdAt.toDate(), 'PPP')}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Deal Name</TableHead>
                                    <TableHead>Principal</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date Created</TableHead>
                                    <TableHead className="text-right"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deals.map(deal => (
                                    <TableRow key={deal.id} onClick={() => router.push(`/client/deals/${deal.id}`)} className="cursor-pointer">
                                        <TableCell className="font-medium">{deal.dealName}</TableCell>
                                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariant[deal.status] || 'secondary'}>{deal.status}</Badge>
                                        </TableCell>
                                        <TableCell>{format(deal.createdAt.toDate(), 'PPP')}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm">
                                                View <ArrowRight className="ml-2 h-4 w-4" />
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
    );
}
