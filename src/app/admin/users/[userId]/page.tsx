
'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, DocumentData, Timestamp, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { User, Landmark, History, Banknote, PlusCircle, HandCoins, Loader2 } from 'lucide-react';
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


type UserProfile = DocumentData & {
    id: string;
    name: string;
    email: string;
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
                setTimeLeft('Ready');
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
  const { user, loading: userLoading } = useUser();
  const [isAddFundOpen, setAddFundOpen] = useState(false);
  const [isZakatPending, startZakatTransition] = useTransition();
  const { toast } = useToast();

  const userRef = useMemo(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId);
  }, [firestore, userId]);

  const fundBatchesQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'fundBatches'), where('sourceId', '==', userId));
  }, [firestore, userId]);

  const allTransactionsQuery = useMemo(() => {
    if (!firestore || !userId) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', userId));
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
  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(allTransactionsQuery);
  const { data: firstDeposit, loading: firstDepositLoading } = useCollection<Transaction>(firstDepositQuery);
  const { data: zakatSettings, loading: zakatLoading } = useDoc<{nisab: number}>(zakatSettingsRef);

  const isLoading = userLoading || profileLoading || fundBatchesLoading || transactionsLoading || firstDepositLoading || zakatLoading;

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

  const { isZakatEligible, isZakatPayable, zakatAmount } = useMemo(() => {
    if (!userProfile) return { isZakatEligible: false, isZakatPayable: false, zakatAmount: 0 };
    
    if (userProfile.role !== 'Investor') {
        return { isZakatEligible: false, isZakatPayable: false, zakatAmount: 0 };
    }

    const nisab = zakatSettings?.nisab || 0;
    const isEligible = financialMetrics.portfolioValue >= nisab;
    const amount = financialMetrics.portfolioValue * 0.025;

    const baseDate = userProfile.lastZakatPaymentDate?.toDate() || firstDeposit?.[0]?.createdAt?.toDate();
    if (!baseDate) return { isZakatEligible: isEligible, isZakatPayable: false, zakatAmount: amount };
    
    const oneYearLater = new Date(baseDate);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const isPayable = new Date() >= oneYearLater && financialMetrics.investibleBalance >= amount;
    
    return { isZakatEligible: isEligible, isZakatPayable: isPayable, zakatAmount: amount };
  }, [financialMetrics, zakatSettings, userProfile, firstDeposit]);


  const processedFundBatches = useMemo(() => {
    if (!fundBatches) return [];
    return fundBatches.map(batch => {
        const batchTenureInDays = convertToDays(batch.tenureValue, batch.tenureUnit);
        const type = batchTenureInDays < EIGHTEEN_MONTHS_IN_DAYS ? 'Short-Term' : 'Long-Term';
        return { ...batch, type };
    });
  }, [fundBatches]);
  
  const handlePayZakat = () => {
    startZakatTransition(async () => {
        const result = await payZakatAction({
            userId: userId,
            zakatAmount: zakatAmount,
            investibleBalance: financialMetrics.investibleBalance,
        });

        if (result.success) {
            toast({ title: "Success", description: result.message });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.message });
        }
    });
  };

  if (isLoading) {
    return <UserDetailSkeleton />;
  }

  if (!userProfile) {
    return notFound();
  }

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
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                         <Avatar className="h-16 w-16">
                            <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile.id}`} />
                            <AvatarFallback>{userProfile.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className='font-headline text-2xl'>{userProfile.name}</CardTitle>
                            <div className='flex gap-2 items-center mt-1'>
                                <Badge variant="secondary">{userProfile.role}</Badge>
                                {isZakatEligible && <Badge variant="default">Zakat Eligible</Badge>}
                            </div>
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
                            <CardDescription>Annual Zakat payment is 2.5% of the total portfolio value.</CardDescription>
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
                            <Button className="w-full mt-2" disabled={!isZakatPayable || isZakatPending} onClick={handlePayZakat}>
                               {isZakatPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                               Pay Zakat
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            {userProfile.role === 'Investor' && (
                <div className="lg:col-span-2 space-y-6">
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
                           <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {transactions?.map(tx => (
                                    <TableRow key={tx.id}>
                                        <TableCell data-label="Date">{formatDate(tx.createdAt)}</TableCell>
                                        <TableCell data-label="Type"><Badge variant={tx.type === 'Deposit' ? 'default' : 'secondary'}>{tx.type}</Badge></TableCell>
                                        <TableCell data-label="Amount" className={`text-right font-medium ${tx.type === 'Deposit' ? 'text-primary' : ''}`}>
                                            {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!transactions?.length && (
                                     <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            No transactions found.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    </div>
  );
}
