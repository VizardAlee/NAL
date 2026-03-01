
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

type UserTransactionType = 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution' | 'PlatformEarning' | 'Zakat' | 'Penalty';
type AdminTransactionType =
    | 'AdminDeposit'
    | 'Expense'
    | 'TransferToInvestible'
    | 'TransferFromInvestible'
    | 'AssetAcquisition'
    | 'AssetSale'
    | 'ManagementFee'
    | 'LoanFromPlatformEarnings'
    | 'LoanRepaymentToPlatformEarnings'
    | 'StaffPayout';

type ActivityType = UserTransactionType | AdminTransactionType;

type UserTransaction = DocumentData & {
  id: string;
  type: UserTransactionType;
  amount: number;
  dealId?: string;
  userId: string;
  createdAt: Timestamp;
  dealName?: string;
  details?: string;
};

type AdministrativeTransaction = DocumentData & {
    id: string;
    type: AdminTransactionType;
    amount: number;
    createdAt: Timestamp;
    description?: string;
    reference?: string;
    loanId?: string;
    createdBy?: string;
};

type ActivityRecord = {
    id: string;
    type: ActivityType;
    amount: number;
    createdAt: Timestamp;
    userId: string;
    details?: string;
    source: 'transactions' | 'administrativeTransactions';
};

const activityTypes = [
    'Deposit',
    'Withdrawal',
    'Investment',
    'Repayment',
    'ProfitDistribution',
    'PlatformEarning',
    'Zakat',
    'Penalty',
    'AdminDeposit',
    'Expense',
    'TransferToInvestible',
    'TransferFromInvestible',
    'AssetAcquisition',
    'AssetSale',
    'ManagementFee',
    'LoanFromPlatformEarnings',
    'LoanRepaymentToPlatformEarnings',
    'StaffPayout',
] as const;

type ActivityTypeFilter = typeof activityTypes[number];

const ITEMS_PER_PAGE = 20;

export default function ActivityPage() {
    const firestore = useFirestore();
    const { user: authUser, loading: authLoading } = useUser();
    const isMobile = useIsMobile();
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTypes, setSelectedTypes] = useState<ActivityTypeFilter[]>([]);

    const transactionsQuery = useMemo(() => {
        if (!firestore || !authUser) return null;
        return query(collection(firestore, 'transactions'), orderBy('createdAt', 'desc'));
    }, [firestore, authUser]);

    const usersQuery = useMemo(() => {
        if (!firestore || !authUser) return null;
        return query(collection(firestore, 'users'));
    }, [firestore, authUser]);

    const adminTransactionsQuery = useMemo(() => {
        if (!firestore || !authUser) return null;
        return query(collection(firestore, 'administrativeTransactions'), orderBy('createdAt', 'desc'));
    }, [firestore, authUser]);

    const { data: transactions, loading: transactionsLoading } = useCollection<UserTransaction>(transactionsQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

    const isLoading = authLoading || transactionsLoading || adminTransactionsLoading || usersLoading;

    const activityFeed = useMemo<ActivityRecord[]>(() => {
        const userFeed: ActivityRecord[] = (transactions || []).map((tx) => ({
            id: `tx-${tx.id}`,
            type: tx.type,
            amount: Number(tx.amount) || 0,
            createdAt: tx.createdAt,
            userId: tx.userId,
            details: tx.dealName || tx.details || (tx.dealId ? `Deal ${tx.dealId}` : undefined),
            source: 'transactions',
        }));

        const adminFeed: ActivityRecord[] = (adminTransactions || []).map((tx) => ({
            id: `admin-tx-${tx.id}`,
            type: tx.type,
            amount: Number(tx.amount) || 0,
            createdAt: tx.createdAt,
            userId: tx.createdBy || 'platform',
            details: tx.description || tx.reference || tx.loanId || undefined,
            source: 'administrativeTransactions',
        }));

        return [...userFeed, ...adminFeed].sort((a, b) => {
            const aMs = a.createdAt?.toMillis?.() ?? 0;
            const bMs = b.createdAt?.toMillis?.() ?? 0;
            return bMs - aMs;
        });
    }, [transactions, adminTransactions]);

    const filteredActivities = useMemo(() => {
        let filtered = activityFeed;
        
        if (selectedTypes.length > 0) {
            filtered = filtered.filter((activity) => selectedTypes.includes(activity.type as ActivityTypeFilter));
        }

        return filtered;
    }, [activityFeed, selectedTypes]);

    const paginatedActivities = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredActivities.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredActivities, currentPage]);

    const totalPages = useMemo(() => {
        return Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
    }, [filteredActivities]);

    const handleFilterChange = (type: ActivityTypeFilter) => {
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

    const getSourceLabel = (activity: ActivityRecord) => {
        if (activity.source === 'administrativeTransactions') {
            return 'Administrative Account';
        }
        return getUserName(activity.userId);
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

        if (paginatedActivities.length === 0) {
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
                        {paginatedActivities.map((activity) => (
                            <Card key={activity.id} className="bg-background">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-medium">{getSourceLabel(activity)}</p>
                                            <Badge variant={activity.amount > 0 ? 'secondary' : 'outline'} className="mt-1">{activity.type}</Badge>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDateTimestamp(activity.createdAt)}</p>
                                        </div>
                                        <p className={`font-bold text-lg ${activity.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                            {activity.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(activity.amount)}
                                        </p>
                                    </div>
                                    {activity.details && (
                                        <div className="text-sm pt-2 border-t">
                                            <span className="text-muted-foreground">Details: </span>
                                            <span className="font-medium">{activity.details}</span>
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
                {paginatedActivities.map((activity) => (
                    <TableRow key={activity.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTimestamp(activity.createdAt)}</TableCell>
                        <TableCell className="font-medium">{getSourceLabel(activity)}</TableCell>
                        <TableCell>
                            <Badge variant={activity.amount > 0 ? 'secondary' : 'outline'}>{activity.type}</Badge>
                        </TableCell>
                        <TableCell>{activity.details || 'N/A'}</TableCell>
                        <TableCell className={`text-right font-medium ${activity.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                            {activity.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(activity.amount)}
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
                            <DropdownMenuLabel>Activity Type</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {activityTypes.map(type => (
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
