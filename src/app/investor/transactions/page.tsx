

'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { ViewPageNav } from "@/components/view-page-nav";
import { useIsMobile } from "@/hooks/use-mobile";

type Transaction = DocumentData & {
    id: string;
    type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution' | 'Zakat';
    amount: number;
    dealId?: string;
    userId: string;
    createdAt: Timestamp;
    dealName?: string; // Denormalized for display
};

const ITEMS_PER_PAGE = 15;

export default function TransactionsPage() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    const [currentPage, setCurrentPage] = useState(1);
    const isMobile = useIsMobile();

    const transactionsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user]);

    const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

    const isLoading = userLoading || transactionsLoading;

    const paginatedTransactions = useMemo(() => {
        if (!transactions) return [];
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [transactions, currentPage]);

    const totalPages = useMemo(() => {
        if (!transactions) return 0;
        return Math.ceil(transactions.length / ITEMS_PER_PAGE);
    }, [transactions]);


    const formatDate = (timestamp: Timestamp | Date | undefined) => {
        if (!timestamp) return 'N/A';
        const parsedDate = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        try { return format(parsedDate, 'PPP p'); } catch { return 'Invalid Date'; }
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="space-y-4">
                    {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            );
        }

        if (!paginatedTransactions || paginatedTransactions.length === 0) {
            return (
                <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
                    No transactions yet.
                </div>
            );
        }

        if (isMobile) {
            return (
                <div className="space-y-3">
                    {paginatedTransactions.map((tx) => (
                        <Card key={tx.id}>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                    <p className={`font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                        {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                    </p>
                                </div>
                                <p className="text-sm text-muted-foreground">{tx.dealName || 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
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
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Details</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedTransactions.map((tx) => (
                                <TableRow key={tx.id}>
                                    <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                    <TableCell>
                                        <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                    </TableCell>
                                    <TableCell>{tx.dealName || 'N/A'}</TableCell>
                                    <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                        {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        )
    }

    return (
        <div>
            <PageHeader
                title="Transaction History"
                description="A complete record of all your financial activities on the platform."
                icon={History}
            >
                <ViewPageNav homePath="/investor/dashboard" />
            </PageHeader>

            {renderContent()}

            {totalPages > 1 && (
                <div className="mt-6">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)) }} aria-disabled={currentPage === 1} />
                            </PaginationItem>
                            {[...Array(totalPages)].map((_, i) => (
                                <PaginationItem key={i}>
                                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1) }} isActive={currentPage === i + 1}>{i + 1}</PaginationLink>
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)) }} aria-disabled={currentPage === totalPages} />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
