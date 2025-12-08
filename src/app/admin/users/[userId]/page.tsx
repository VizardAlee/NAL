

'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { User, Landmark, History, Banknote, PlusCircle, HandCoins, Loader2, FileText, ArrowRight, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AddFundForm } from './add-fund-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, formatDistanceStrict } from 'date-fns';
import { Naira } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ViewPageNav } from '@/components/view-page-nav';
import { payZakatAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Deal } from '@/lib/types';


type UserProfile = DocumentData & {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
    role: 'Admin' | 'Investor' | 'Client';
    lastZakatPaymentDate?: Timestamp;
};

type FundBatch = DocumentData & {
  id: string;
  sourceId: string;
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
  tenureValue: number;
  tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
};

type Transaction = DocumentData & {
  id: string;
  type: string;
  amount: number;
  createdAt: Timestamp;
};

const DURATION_IN_DAYS = {
    Days: 1,
    Weeks: 7,
    Fortnights: 14,
    Months: 30.4375,
    Years: 365.25,
};

const ITEMS_PER_PAGE = 10;

function convertToDays(value: number, unit: keyof typeof DURATION_IN_DAYS): number {
    return value * (DURATION_IN_DAYS[unit] || 0);
}

const EIGHTEEN_MONTHS_IN_DAYS = 18 * DURATION_IN_DAYS.Months;

function UserDetailSkeleton() {
    return (
        <div>
            <PageHeader
                title="User Profile"
                description="Loading user details..."
                icon={User}
            />
             <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader className="flex-row items-center gap-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <div className='space-y-2'>
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                        </CardHeader>
                    </Card>
                </div>
             </div>
        </div>
    )
}

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, 'PPP p');
    } catch {
      return 'Invalid Date';
    }
  };

  const ZakatCountdown = ({ firstDepositDate, lastZakatPaymentDate }: { firstDepositDate: Date, lastZakatPaymentDate?: Date }) => {
    const [timeLeft, setTimeLeft] = useState('');

    const targetDate = useMemo(() => {
        const baseDate = lastZakatPaymentDate || firstDepositDate;
        const target = new Date(baseDate);
        target.setFullYear(target.getFullYear() + 1);
        return target;
    }, [firstDepositDate, lastZakatPaymentDate]);

    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            if (now >= targetDate) {
                setTimeLeft('Due for automatic payment');
            } else {
                setTimeLeft(formatDistanceStrict(targetDate, now, { unit: 'day' }) + ' remaining');
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [targetDate]);

    return (
        <p className="text-xs text-muted-foreground">{timeLeft}</p>
    );
};


export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const firestore = useFirestore();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [isAddFundOpen, setAddFundOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [currentPage, setCurrentPage] = useState(1);

  const userRef = useMemo(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId);
  }, [firestore, userId]);

  const fundBatchesQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'fundBatches'), where('sourceId', '==', userId), orderBy('createdAt', 'asc'));
  }, [firestore, userId]);
  
  const clientDealsQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'deals'), where('clientId', '==', userId), orderBy('createdAt', 'desc'));
  }, [firestore, userId]);

  const allTransactionsQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  }, [firestore, userId]);

  const firstDepositQuery = useMemo(() => {
      if (!firestore || !userId) return null;
      return query(collection(firestore, 'transactions'), where('userId', '==', userId), where('type', '==', 'Deposit'), orderBy('createdAt', 'asc'), limit(1));
  }, [firestore, userId]);

  const zakatSettingsRef = useMemo(() => {
      if (!firestore || !user) return null;
      return doc(firestore, 'platformSettings', 'zakat');
  }, [firestore, user]);

  const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(userRef);
  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: clientDeals, loading: clientDealsLoading } = useCollection<Deal>(clientDealsQuery);
  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(allTransactionsQuery);
  const { data: firstDeposit, loading: firstDepositLoading } = useCollection<Transaction>(firstDepositQuery);
  const { data: zakatSettings, loading: zakatLoading } = useDoc<{nisab: number}>(zakatSettingsRef);

  const isLoading = userLoading || profileLoading || fundBatchesLoading || transactionsLoading || firstDepositLoading || zakatLoading || clientDealsLoading;

  const financialMetrics = useMemo(() => {
      if (!transactions) return { portfolioValue: 0, investibleBalance: 0 };
      const totalCapital = transactions.filter(tx => tx.type === 'Deposit').reduce((sum, tx) => sum + tx.amount, 0);
      const totalProfit = transactions.filter(tx => tx.type === 'ProfitDistribution').reduce((sum, tx) => sum + tx.amount, 0);
      const totalWithdrawn = transactions.filter(tx => tx.type === 'Withdrawal').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const totalZakat = transactions.filter(tx => tx.type === 'Zakat').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const portfolioValue = (totalCapital + totalProfit) - (totalWithdrawn + totalZakat);
      const investibleBalance = fundBatches?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;
      return { portfolioValue, investibleBalance };
  }, [transactions, fundBatches]);

  const { isZakatEligible, zakatAmount } = useMemo(() => {
    if (!userProfile) return { isZakatEligible: false, isZakatPayable: false, zakatAmount: 0 };
    
    if (userProfile.role !== 'Investor') {
        return { isZakatEligible: false, isZakatPayable: false, zakatAmount: 0 };
    }

    const nisab = zakatSettings?.nisab || 0;
    const isEligible = financialMetrics.portfolioValue >= nisab;
    const amount = financialMetrics.portfolioValue * 0.025;
    
    return { isZakatEligible: isEligible, zakatAmount: amount };
  }, [financialMetrics, zakatSettings, userProfile]);


  const processedFundBatches = useMemo(() => {
    if (!fundBatches) return [];
    return fundBatches.map(batch => {
        const batchTenureInDays = convertToDays(batch.tenureValue, batch.tenureUnit);
        const type = batchTenureInDays < EIGHTEEN_MONTHS_IN_DAYS ? 'Short-Term' : 'Long-Term';
        return { ...batch, type };
    });
  }, [fundBatches]);

  const paginatedTransactions = useMemo(() => {
    if (!transactions) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [transactions, currentPage]);

  const totalPages = useMemo(() => {
    if (!transactions) return 0;
    return Math.ceil(transactions.length / ITEMS_PER_PAGE);
  }, [transactions]);
  

  if (isLoading || isMobile === undefined) {
    return <UserDetailSkeleton />;
  }

  if (!userProfile) {
    return notFound();
  }
  
  const statusVariant = {
    Pending: 'secondary',
    Active: 'default',
    Completed: 'outline',
    Terminated: 'destructive',
  } as const;

  return (
    <div>
        <PageHeader
            title={userProfile.name}
            description={userProfile.email}
            icon={User}
        >
            <ViewPageNav homePath="/admin/users" />
        </PageHeader>
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader className="flex-row items-center gap-4 space-y-0">
                         <Avatar className="h-16 w-16">
                            <AvatarImage src={`https://picsum.photos/seed/${userProfile.id}/128/128`} />
                            <AvatarFallback>{userProfile.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className='font-headline text-2xl'>{userProfile.name}</CardTitle>
                            <div className='flex gap-2 items-center mt-1'>
                                <Badge variant="secondary">{userProfile.role}</Badge>
                                {isZakatEligible && <Badge variant="default">Zakat Eligible</Badge>}
                            </div>
                            {userProfile.phoneNumber && (
                                <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    <span>{userProfile.phoneNumber}</span>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                </Card>

                {userProfile.role === 'Investor' && (
                     <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                                
                            </div>
                             <CardDescription>Total current value including all capital and profits.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="text-3xl font-bold font-headline">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.portfolioValue)}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {userProfile.role === 'Investor' && (
                     <Card>
                        <CardHeader>
                             <div className="flex justify-between items-center">
                                <CardTitle className="text-sm font-medium">Investible Balance</CardTitle>
                                
                            </div>
                             <CardDescription>Total capital available for new deals.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="text-3xl font-bold font-headline">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.investibleBalance)}
                            </div>
                           <Dialog open={isAddFundOpen} onOpenChange={setAddFundOpen}>
                            <DialogTrigger asChild>
                                <Button className="w-full">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add Funds
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                <DialogTitle>Add Funds to Investor Account</DialogTitle>
                                </DialogHeader>
                                <AddFundForm userId={userId} />
                            </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>
                )}

                 {userProfile.role === 'Investor' && isZakatEligible && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Zakat Payment</CardTitle>
                            <CardDescription>Annual Zakat is 2.5% of the portfolio value and is processed automatically when due.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold font-headline mb-2">
                                {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(zakatAmount)}
                            </div>
                            {firstDeposit?.[0]?.createdAt && (
                                <ZakatCountdown
                                    firstDepositDate={firstDeposit[0].createdAt.toDate()}
                                    lastZakatPaymentDate={userProfile.lastZakatPaymentDate?.toDate()}
                                />
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="lg:col-span-2 space-y-6">
                {userProfile.role === 'Investor' && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Landmark className="h-5 w-5" />
                                    <span>Fund Batches</span>
                                </CardTitle>
                                <CardDescription>
                                    Capital deposited by this investor, available for deals.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isMobile ? (
                                    <div className="space-y-3">
                                        {processedFundBatches.length > 0 ? processedFundBatches.map(batch => (
                                            <Card key={batch.id} className="p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</p>
                                                        <p className="text-xs text-muted-foreground">{formatDate(batch.createdAt)}</p>
                                                    </div>
                                                    <Badge variant={batch.type === 'Long-Term' ? 'default' : 'secondary'}>{batch.type}</Badge>
                                                </div>
                                                <div className="mt-2 text-primary font-medium text-right">
                                                    <span className="text-xs text-muted-foreground">Available: </span>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}
                                                </div>
                                            </Card>
                                        )) : (
                                            <p className="text-sm text-muted-foreground text-center py-4">No fund batches found.</p>
                                        )}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Total Amount</TableHead>
                                            <TableHead className="text-right">Investible Balance</TableHead>
                                        </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                        {processedFundBatches?.map(batch => (
                                            <TableRow key={batch.id}>
                                                <TableCell data-label="Date">{formatDate(batch.createdAt)}</TableCell>
                                                <TableCell data-label="Type">
                                                    <Badge variant={batch.type === 'Long-Term' ? 'default' : 'secondary'}>{batch.type}</Badge>
                                                </TableCell>
                                                <TableCell data-label="Total Amount" className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</TableCell>
                                                <TableCell data-label="Investible Balance" className="text-right text-primary font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {!processedFundBatches?.length && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">
                                                    No fund batches found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5" />
                                    <span>Transaction History</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                            {isMobile ? (
                                    <div className="space-y-3">
                                        {paginatedTransactions?.length > 0 ? paginatedTransactions.map(tx => (
                                            <Card key={tx.id} className="p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                                        <p className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</p>
                                                    </div>
                                                    <p className={`font-medium ${tx.amount > 0 ? 'text-primary' : ''}`}>
                                                        {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                                    </p>
                                                </div>
                                            </Card>
                                        )) : (
                                            <p className="text-sm text-muted-foreground text-center py-4">No transactions found.</p>
                                        )}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                        {paginatedTransactions?.map(tx => (
                                            <TableRow key={tx.id}>
                                                <TableCell data-label="Date">{formatDate(tx.createdAt)}</TableCell>
                                                <TableCell data-label="Type"><Badge variant={tx.amount > 0 ? 'default' : 'secondary'}>{tx.type}</Badge></TableCell>
                                                <TableCell data-label="Amount" className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : ''}`}>
                                                    {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {!paginatedTransactions?.length && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-24 text-center">
                                                    No transactions found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                            {totalPages > 1 && (
                                <div className="p-4 border-t">
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
                        </Card>
                    </>
                )}
                 {userProfile.role === 'Client' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                <span>Client Deals</span>
                            </CardTitle>
                            <CardDescription>
                                A list of all financing deals associated with this client.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isMobile ? (
                                <div className="space-y-3">
                                    {clientDeals && clientDeals.length > 0 ? clientDeals.map(deal => (
                                        <Card key={deal.id} className="p-4" onClick={() => router.push(`/admin/deals/${deal.id}`)}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-medium">{deal.dealName}</p>
                                                     <p className="text-sm font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</p>
                                                </div>
                                                <Badge variant={statusVariant[deal.status as keyof typeof statusVariant] || 'secondary'}>
                                                    {deal.status}
                                                </Badge>
                                            </div>
                                        </Card>
                                    )) : (
                                        <div className="text-center text-sm text-muted-foreground py-10">This client has no deals.</div>
                                    )}
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Deal Name</TableHead>
                                            <TableHead>Principal</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clientDeals && clientDeals.length > 0 ? clientDeals.map(deal => (
                                            <TableRow key={deal.id} className="cursor-pointer" onClick={() => router.push(`/admin/deals/${deal.id}`)}>
                                                <TableCell className="font-medium">{deal.dealName}</TableCell>
                                                <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={statusVariant[deal.status as keyof typeof statusVariant] || 'secondary'}>
                                                        {deal.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm">
                                                        View Deal <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">
                                                    This client has no deals.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    </div>
  );
}
