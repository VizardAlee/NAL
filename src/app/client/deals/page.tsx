
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight } from "lucide-react";
import { useMemo, useState } from 'react';
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


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
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | Deal['status']>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'principal-desc' | 'principal-asc'>('newest');
    const isMobile = useIsMobile();

    const dealsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user?.uid]);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery as any);

    const visibleDeals = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return [...(deals || [])]
            .filter((deal) => {
                const matchesSearch = !normalizedSearch || deal.dealName?.toLowerCase().includes(normalizedSearch);
                const matchesStatus = statusFilter === 'all' || deal.status === statusFilter;
                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => {
                if (sortBy === 'principal-desc') return Number(b.principal || 0) - Number(a.principal || 0);
                if (sortBy === 'principal-asc') return Number(a.principal || 0) - Number(b.principal || 0);
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
            });
    }, [deals, searchTerm, sortBy, statusFilter]);
    
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

            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search deals"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Terminated">Terminated</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Sort deals" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="oldest">Oldest first</SelectItem>
                        <SelectItem value="principal-desc">Highest principal</SelectItem>
                        <SelectItem value="principal-asc">Lowest principal</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            {visibleDeals.length === 0 ? (
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
                    {visibleDeals.map(deal => (
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
                                {visibleDeals.map(deal => (
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
