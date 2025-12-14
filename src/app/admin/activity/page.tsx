
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
import { CalendarIcon, History, ListFilter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

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
    const { user: authUser, loading: authLoading } = useUser();
    const isMobile = useIsMobile();
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTypes, setSelectedTypes] = useState<TransactionTypeFilter[]>([]);

    const transactionsQuery = useMemo(() => {
        if (!firestore || !authUser) return null;
        return query(collection(firestore, 'transactions'), orderBy('createdAt', 'desc'));
    }, [firestore, authUser]);

    const usersQuery = useMemo(() => {
        if (!firestore || !authUser) return null;
        return query(collection(firestore, 'users'));
    }, [firestore, authUser]);

    const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

    const isLoading = authLoading || transactionsLoading || usersLoading;

    const filteredTransactions = useMemo(() => {
        if (!transactions) return [];
        
        let filtered = transactions;
        
        if (selectedTypes.length > 0) {
            filtered = filtered.filter(tx => selectedTypes.includes(tx.type as TransactionTypeFilter));
        }

        return filtered;
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
        setCurrentPage(1);
    };

    const formatDateTimestamp = (timestamp: Timestamp | Date | undefined) => {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        try { return format(date, 'PPP p'); } catch { return 'Invalid Date'; }
    };
    
    const getUserName = (userId: string) => {
        if (userId === 'platform') return 'Platform';
        return users?.find(u => u.id === userId)?.name || 'Unknown User';
    };


    const renderContent = () => {
        if (isLoading) {
            if (isMobile) {
                return (
                    <Card>
                        <CardContent className="space-y-4 p-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-28 w-full rounded-lg" />
                            ))}
                        </CardContent>
                    </Card>
                );
            }
            return (
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
                        {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            );
        }

        if (paginatedTransactions.length === 0) {
             return (
                <Card className="h-48 flex items-center justify-center">
                    <p className="text-muted-foreground">No activities found matching your criteria.</p>
                </Card>
             );
        }

        if (isMobile) {
            return (
                <Card>
                    <CardContent className="p-4 space-y-3">
                        {paginatedTransactions.map((tx) => (
                            <Card key={tx.id} className="bg-background">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-medium">{getUserName(tx.userId)}</p>
                                            <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'} className="mt-1">{tx.type}</Badge>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDateTimestamp(tx.createdAt)}</p>
                                        </div>
                                        <p className={`font-bold text-lg ${tx.amount > 0 && tx.type !== 'Withdrawal' ? 'text-primary' : 'text-foreground'}`}>
                                            {tx.amount > 0 && tx.type !== 'Withdrawal' ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                        </p>
                                    </div>
                                    {tx.dealName && (
                                        <div className="text-sm pt-2 border-t">
                                            <span className="text-muted-foreground">Deal: </span>
                                            <span className="font-medium">{tx.dealName}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </CardContent>
                </Card>
            )
        }

        return (
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
                {paginatedTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTimestamp(tx.createdAt)}</TableCell>
                        <TableCell className="font-medium">{getUserName(tx.userId)}</TableCell>
                        <TableCell>
                            <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                        </TableCell>
                        <TableCell>{tx.dealName || 'N/A'}</TableCell>
                        <TableCell className={`text-right font-medium ${tx.amount > 0 && tx.type !== 'Withdrawal' ? 'text-primary' : 'text-foreground'}`}>
                            {tx.amount > 0 && tx.type !== 'Withdrawal' ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        );
    }


    return (
        <div>
            <PageHeader
                title="Activity Log"
                description="Track all significant actions for auditing purposes."
                icon={History}
            >
                <div className="flex flex-col sm:flex-row gap-2">
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
                </div>
            </PageHeader>
            
            {isMobile ? (
                renderContent()
            ) : (
                <Card>
                    <CardContent className="p-0">
                        {renderContent()}
                    </CardContent>
                </Card>
            )}


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
