
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { History, ListFilter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { User } from '@/lib/types';


type Transaction = DocumentData & {
  id: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution' | 'PlatformEarning';
  amount: number;
  dealId?: string;
  userId: string;
  createdAt: Timestamp;
  dealName?: string;
};

const transactionTypes = [
    'Deposit', 
    'Withdrawal', 
    'Investment', 
    'Repayment', 
    'ProfitDistribution', 
    'PlatformEarning'
] as const;

type TransactionTypeFilter = typeof transactionTypes[number];

const ITEMS_PER_PAGE = 20;

export default function ActivityPage() {
    const firestore = useFirestore();
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTypes, setSelectedTypes] = useState<TransactionTypeFilter[]>([]);

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'transactions'), orderBy('createdAt', 'desc'));
    }, [firestore]);

    const usersQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

    const isLoading = transactionsLoading || usersLoading;

    const filteredTransactions = useMemo(() => {
        if (!transactions) return [];
        if (selectedTypes.length === 0) return transactions;
        return transactions.filter(tx => selectedTypes.includes(tx.type as TransactionTypeFilter));
    }, [transactions, selectedTypes]);

    const paginatedTransactions = useMemo(() => {
        if (!filteredTransactions) return [];
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredTransactions, currentPage]);

    const totalPages = useMemo(() => {
        if (!filteredTransactions) return 0;
        return Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
    }, [filteredTransactions]);

    const handleFilterChange = (type: TransactionTypeFilter) => {
        setSelectedTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
        setCurrentPage(1); // Reset to first page on filter change
    };

    const formatDate = (timestamp: Timestamp | Date | undefined) => {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        try { return format(date, 'PPP p'); } catch { return 'Invalid Date'; }
    };
    
    const getUserName = (userId: string) => {
        if (userId === 'platform') return 'Platform';
        return users?.find(u => u.id === userId)?.name || 'Unknown User';
    };


    return (
        <div>
            <PageHeader
                title="Activity Log"
                description="Track all significant actions for auditing purposes."
                icon={History}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="shrink-0">
                            <ListFilter className="mr-2 h-4 w-4" />
                            Filter by Type
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Transaction Type</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {transactionTypes.map(type => (
                             <DropdownMenuCheckboxItem
                                key={type}
                                checked={selectedTypes.includes(type)}
                                onCheckedChange={() => handleFilterChange(type)}
                             >
                                {type}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </PageHeader>
            
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>User/Source</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Details</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {isLoading && Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell data-label="Date"><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell data-label="User/Source"><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell data-label="Type"><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell data-label="Details"><Skeleton className="h-5 w-40" /></TableCell>
                                <TableCell data-label="Amount" className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && paginatedTransactions.map((tx) => (
                            <TableRow key={tx.id}>
                                <TableCell data-label="Date" className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</TableCell>
                                <TableCell data-label="User/Source" className="font-medium">{getUserName(tx.userId)}</TableCell>
                                <TableCell data-label="Type">
                                    <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                </TableCell>
                                <TableCell data-label="Details">{tx.dealName || 'N/A'}</TableCell>
                                <TableCell data-label="Amount" className={`text-right font-medium ${tx.amount > 0 && tx.type !== 'Withdrawal' ? 'text-primary' : 'text-foreground'}`}>
                                    {tx.amount > 0 && tx.type !== 'Withdrawal' ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && paginatedTransactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No activities found matching your criteria.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {totalPages > 1 && (
                <div className="mt-6">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)) }} aria-disabled={currentPage === 1} />
                            </PaginationItem>
                            {[...Array(totalPages)].map((_, i) => (
                                <PaginationItem key={i}>
                                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1); }} isActive={currentPage === i + 1}>
                                        {i + 1}
                                    </PaginationLink>
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
