

'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, History } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { ViewPageNav } from "@/components/view-page-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";

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
const transactionTypes = ['Deposit', 'Withdrawal', 'Investment', 'Repayment', 'ProfitDistribution', 'Zakat'] as const;

function TransactionsContent() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    const searchParams = useSearchParams();
    const dealIdFilter = searchParams.get('dealId') || '';
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | Transaction['type']>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const isMobile = useIsMobile();

    const transactionsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    }, [firestore, user]);

    const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

    const isLoading = userLoading || transactionsLoading;

    const filteredTransactions = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
        const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

        return (transactions || []).filter((tx) => {
            const txDate = tx.createdAt.toDate();
            const matchesDeal = !dealIdFilter || tx.dealId === dealIdFilter;
            const matchesType = typeFilter === 'all' || tx.type === typeFilter;
            const matchesSearch =
                !normalizedSearch ||
                tx.type.toLowerCase().includes(normalizedSearch) ||
                tx.dealName?.toLowerCase().includes(normalizedSearch);
            const matchesStart = !start || txDate >= start;
            const matchesEnd = !end || txDate <= end;
            return matchesDeal && matchesType && matchesSearch && matchesStart && matchesEnd;
        });
    }, [dealIdFilter, endDate, searchTerm, startDate, transactions, typeFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [dealIdFilter, endDate, searchTerm, startDate, typeFilter]);

    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredTransactions, currentPage]);

    const totalPages = useMemo(() => {
        return Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
    }, [filteredTransactions]);


    const formatDate = (timestamp: Timestamp | Date | undefined) => {
        if (!timestamp) return 'N/A';
        const parsedDate = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        try { return format(parsedDate, 'PPP p'); } catch { return 'Invalid Date'; }
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

    const handleExport = () => {
        const headers = ['Date', 'Type', 'Details', 'Amount'];
        const rows = filteredTransactions.map((tx) => [
            formatDate(tx.createdAt),
            tx.type,
            tx.dealName || '',
            tx.amount.toString(),
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'investor-transactions.csv';
        link.click();
        URL.revokeObjectURL(url);
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
                                        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
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
                                        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
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
                title={dealIdFilter ? "Filtered Transactions" : "Transaction History"}
                description="A complete record of all your financial activities on the platform."
                icon={History}
            >
                <ViewPageNav homePath="/investor/dashboard" />
            </PageHeader>

            <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_160px_auto]">
                <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by type or deal"
                />
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {transactionTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                <Button variant="outline" onClick={handleExport} disabled={filteredTransactions.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </div>

            {dealIdFilter && (
                <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Showing activity for selected deal ID: <span className="font-medium text-foreground">{dealIdFilter}</span>
                </div>
            )}

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

export default function TransactionsPage() {
    return (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <TransactionsContent />
        </Suspense>
    );
}
