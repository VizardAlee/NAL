
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Landmark, History, FileText, Download, Wallet, RefreshCcw, Loader2, Banknote, ArrowRight, PlusCircle, MessageSquare, Copy } from "lucide-react";
import { useMemo, useState, useTransition } from 'react';
import { useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, Timestamp, orderBy, limit, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useUser, type User } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays, addDays } from 'date-fns';
import { Deal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { WithdrawForm } from "./withdraw-form";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { reinvestAction } from "./withdrawal-actions";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { DepositForm } from "./deposit-form";
import { getOrCreateConversation } from "@/app/common/actions/chat-actions";
import { useRouter } from "next/navigation";


type Transaction = DocumentData & {
  id: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution' | 'Zakat';
  amount: number;
  dealId?: string;
  userId: string;
  createdAt: Timestamp;
  dealName?: string; // Denormalized for display
};

type Investment = DocumentData & {
  id: string;
  investorId: string;
  dealId: string;
  amount: number;
  createdAt: Timestamp;
};

type FundBatch = DocumentData & {
    sourceId: string;
    amount: number;
    remainingAmount: number;
    createdAt: Timestamp;
    tenureValue: number;
    tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    details?: string;
};

type UserProfile = DocumentData & {
    id: string;
    lastWithdrawalDate?: Timestamp;
    name: string;
    role: 'Admin' | 'Client' | 'Investor';
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


const chartConfig = {
  portfolioValue: { label: "Portfolio Value", color: "hsl(var(--chart-1))" },
};

function ReinvestButton({ balance, user }: { balance: number, user: User }) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleReinvest = () => {
        startTransition(async () => {
            const result = await reinvestAction({ amount: balance, userId: user.uid, userName: user.displayName || 'Unknown' });
            if (result.success) {
                toast({
                    title: "Reinvestment Request Sent",
                    description: result.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Reinvestment Failed",
                    description: result.message,
                });
            }
        });
    };

    return (
        <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-1" 
            onClick={handleReinvest} 
            disabled={balance <= 0 || isPending}
        >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4"/>}
            Reinvest Balance
        </Button>
    );
}

function BankDetailsCard() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const bankDetailsRef = useMemo(() => firestore ? doc(firestore, 'platformSettings', 'bankDetails') : null, [firestore]);
    const { data: bankDetails, loading } = useDoc(bankDetailsRef);

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied!', description: `${field} copied to clipboard.` });
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                    <CardDescription>For making deposits and manual repayments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-6 w-2/3" />
                </CardContent>
            </Card>
        );
    }
    
    if (!bankDetails) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                <CardDescription>For making deposits and manual repayments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Bank Name</p>
                        <p className="font-medium">{bankDetails.bankName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Name</p>
                        <p className="font-medium">{bankDetails.accountName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Number</p>
                        <p className="font-medium">{bankDetails.accountNumber}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(bankDetails.accountNumber, 'Account Number')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function ContactAdminSheet() {
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const adminsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'), where('role', '==', 'Admin'));
    }, [firestore]);

    const { data: admins, loading } = useCollection<UserProfile>(adminsQuery);

    const handleSelectAdmin = (admin: UserProfile) => {
        if (!user?.displayName) return;
        startTransition(async () => {
            const result = await getOrCreateConversation({
                adminId: admin.id,
                adminName: admin.name,
                userId: user.uid,
                userName: user.displayName
            });

            if (result.success && result.conversationId) {
                router.push(`/investor/messages/${result.conversationId}`);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message || "Could not start conversation.",
                });
            }
        });
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Contact Admin
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Contact an Administrator</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-3">
                    {loading && <p>Loading admins...</p>}
                    {admins?.map(admin => (
                        <Button
                            key={admin.id}
                            variant="secondary"
                            className="w-full justify-start h-14"
                            onClick={() => handleSelectAdmin(admin)}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <MessageSquare className="mr-4 h-4 w-4" />}
                            Chat with {admin.name}
                        </Button>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}


export default function InvestorDashboard() {
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  const [isWithdrawOpen, setWithdrawOpen] = useState(false);
  const [isDepositOpen, setDepositOpen] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isReinvestPending, startReinvestTransition] = useTransition();

  const userProfileRef = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  // Query for all transactions for chart and metrics
  const allTransactionsQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'));
  }, [firestore, user]);

  // Query for recent transactions for the dashboard card
  const recentTransactionsQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
  }, [firestore, user]);
  
  const investmentsQuery = useMemo(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'investments'), where('investorId', '==', user.uid));
  }, [firestore, user]);

  const fundBatchesQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'fundBatches'), where('sourceId', '==', user.uid));
  }, [firestore, user]);
  
  const firstDepositQuery = useMemo(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), where('type', '==', 'Deposit'), orderBy('createdAt', 'asc'), limit(1));
  }, [firestore, user]);


  const { data: userProfile, loading: userProfileLoading } = useDoc<UserProfile>(userProfileRef as any);
  const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);
  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: allTransactions, loading: allTransactionsLoading } = useCollection<Transaction>(allTransactionsQuery);
  const { data: recentTransactions, loading: recentTransactionsLoading } = useCollection<Transaction>(recentTransactionsQuery);
  const { data: firstDeposit, loading: firstDepositLoading } = useCollection<Transaction>(firstDepositQuery);


  const investedDealIds = useMemo(() => {
      if (!investments) return [];
      return [...new Set(investments.map(inv => inv.dealId))];
  }, [investments]);
  
  const dealsQuery = useMemo(() => {
      if (!firestore || investedDealIds.length === 0) return null;
      return query(collection(firestore, 'deals'), where('__name__', 'in', investedDealIds));
  }, [firestore, investedDealIds]);
  
  const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);

  const isLoading = userLoading || allTransactionsLoading || recentTransactionsLoading || investmentsLoading || dealsLoading || fundBatchesLoading || isMobile === undefined || userProfileLoading || firstDepositLoading;

  const { longTermProfits, withdrawableBalance, returnedPrincipal } = useMemo(() => {
    if (!allTransactions || !deals) {
        return { longTermProfits: 0, withdrawableBalance: 0, returnedPrincipal: 0 };
    }

    const profitTransactions = allTransactions.filter(tx => tx.type === 'ProfitDistribution');
    const totalWithdrawnFromProfits = allTransactions
        .filter(tx => tx.type === 'Withdrawal')
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    let totalLongTermProfit = 0;
    let totalShortTermProfit = 0;

    for (const profitTx of profitTransactions) {
        const deal = deals.find(d => d.id === profitTx.dealId);
        if (!deal) continue;

        const dealDurationInDays = convertToDays(deal.durationValue, deal.durationUnit);
        
        if (dealDurationInDays >= EIGHTEEN_MONTHS_IN_DAYS) {
            totalLongTermProfit += profitTx.amount;
        } else {
            totalShortTermProfit += profitTx.amount;
        }
    }

    const _returnedPrincipal = fundBatches?.filter(b => b.details?.startsWith('Returned principal')).reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;

    return {
        longTermProfits: totalLongTermProfit,
        withdrawableBalance: totalShortTermProfit - totalWithdrawnFromProfits,
        returnedPrincipal: _returnedPrincipal
    };
}, [allTransactions, deals, fundBatches]);


  const financialMetrics = useMemo(() => {
    if (!allTransactions) {
      return { totalCapital: 0, portfolioValue: 0, investableBalance: 0, simpleROI: 0 };
    }
    const totalCapital = allTransactions
      .filter(tx => tx.type === 'Deposit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalProfit = allTransactions
      .filter(tx => tx.type === 'ProfitDistribution')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalWithdrawn = allTransactions
      .filter(tx => tx.type === 'Withdrawal' || tx.type === 'Zakat')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const portfolioValue = (totalCapital + totalProfit) - totalWithdrawn;
    const simpleROI = totalCapital > 0 ? (totalProfit / totalCapital) * 100 : 0;
    
    const investableBalance = fundBatches?.filter(b => !b.details?.startsWith('Returned principal')).reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;


    return { totalCapital, portfolioValue, investableBalance, simpleROI };
  }, [allTransactions, fundBatches]);

  const withdrawalRules = useMemo(() => {
    const isLocked = longTermProfits > 0 && (!firstDeposit?.[0] || differenceInDays(new Date(), firstDeposit[0].createdAt.toDate()) < 365);
    const lastWithdrawal = userProfile?.lastWithdrawalDate?.toDate();
    const cooldownActive = lastWithdrawal ? differenceInDays(new Date(), lastWithdrawal) < 90 : false;
    
    const availableForWithdrawal = Math.min(longTermProfits * 0.2, financialMetrics.investableBalance);

    return {
        isLocked,
        cooldownActive,
        maxWithdrawal: availableForWithdrawal,
    };
  }, [longTermProfits, firstDeposit, userProfile, financialMetrics.investableBalance]);
  
  const chartData = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return [];

    let runningCapital = 0;
    let runningProfit = 0;
    let runningWithdrawn = 0;

    const dataByMonth: { [month: string]: number } = {};

    allTransactions.forEach(tx => {
        const month = format(tx.createdAt.toDate(), 'yyyy-MM');
        
        if (tx.type === 'Deposit') runningCapital += tx.amount;
        if (tx.type === 'Withdrawal' || tx.type === 'Zakat') runningWithdrawn += Math.abs(tx.amount);
        if (tx.type === 'ProfitDistribution') runningProfit += tx.amount;
        
        dataByMonth[month] = (runningCapital + runningProfit) - runningWithdrawn;
    });
    
    return Object.keys(dataByMonth).map(month => ({
        month: format(new Date(month + '-02'), 'MMM yy'), // Add day to avoid timezone issues
        portfolioValue: dataByMonth[month]
    })).sort((a,b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  }, [allTransactions]);

    const handleWithdrawalSuccess = async () => {
        setWithdrawOpen(false);
        if(firestore && user) {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { lastWithdrawalDate: Timestamp.now() });
        }
    };

    const handleReinvestReturnedPrincipal = () => {
        if (!user) return;
        startReinvestTransition(async () => {
            if (!firestore) return;
            const batch = writeBatch(firestore);

            const returnedBatches = fundBatches?.filter(b => b.details?.startsWith('Returned principal')) || [];
            
            for (const batchDoc of returnedBatches) {
                batch.update(doc(firestore, 'fundBatches', batchDoc.id), {
                    details: 'Reinvested returned principal'
                });
            }

            try {
                await batch.commit();
                toast({
                    title: "Success",
                    description: "Returned principal has been moved to your investible balance."
                });
            } catch (error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to reinvest returned principal."
                });
            }
        });
    }


  const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : date;
    try { return format(date, 'PPP'); } catch { return 'Invalid Date'; }
  };

  return (
    <div>
      <PageHeader
        title="Investor Dashboard"
        description="Welcome to your personal investment hub."
        icon={Landmark}
      >
        <div className="flex gap-2">
            <ContactAdminSheet />
            <Dialog open={isDepositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
                <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Request Deposit
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                <DialogTitle>Request a Deposit</DialogTitle>
                </DialogHeader>
                <DepositForm onDepositRequested={() => setDepositOpen(false)} />
            </DialogContent>
            </Dialog>
        </div>
      </PageHeader>

        <div className="mb-8">
            <BankDetailsCard />
        </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <span className="text-muted-foreground font-bold text-lg">₦</span>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.portfolioValue)}</div>}
            <p className="text-xs text-muted-foreground">Total value of your investments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investable Balance</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.investableBalance)}</div>}
            <p className="text-xs text-muted-foreground">Capital ready for new deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Withdrawable Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(withdrawableBalance)}</div>}
             <Dialog open={isWithdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-1" 
                    disabled={withdrawableBalance <= 0}
                >
                  <Download className="mr-2 h-4 w-4"/>
                  Withdraw Profits
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Fund Withdrawal</DialogTitle>
                </DialogHeader>
                <WithdrawForm withdrawableBalance={withdrawableBalance} onWithdrawalRequested={handleWithdrawalSuccess} />
              </DialogContent>
            </Dialog>
            {user && <ReinvestButton balance={withdrawableBalance} user={user} />}
             {withdrawalRules.isLocked && <p className="text-xs text-destructive mt-1">Long-term profits are locked for 1 year.</p>}
             {withdrawalRules.cooldownActive && <p className="text-xs text-destructive mt-1">Next withdrawal available in {90 - differenceInDays(new Date(), userProfile!.lastWithdrawalDate!.toDate())} days.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Simple ROI</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{financialMetrics.simpleROI.toFixed(2)}%</div>}
            <p className="text-xs text-muted-foreground">Based on total profit vs. total capital</p>
          </CardContent>
        </Card>
      </div>

        {returnedPrincipal > 0 && (
            <Card className="mt-8 bg-secondary">
                <CardHeader>
                    <CardTitle>Returned Principal</CardTitle>
                    <CardDescription>This is principal returned from completed or terminated deals. It must be re-invested to be used in new deals.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-3xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(returnedPrincipal)}</div>
                    <Button onClick={handleReinvestReturnedPrincipal} disabled={isReinvestPending}>
                         {isReinvestPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                        Re-invest Returned Principal
                    </Button>
                </CardContent>
            </Card>
        )}

       <Card className="mt-8">
        <CardHeader>
            <CardTitle>Financial Activity</CardTitle>
            <CardDescription>The growth of your total portfolio value over time.</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
            {isLoading ? (
                <div className="h-[250px] w-full flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                </div>
            ) : (
             <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart
                    accessibilityLayer
                    data={chartData}
                    margin={{
                        left: 12,
                        right: 12,
                    }}
                >
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                    />
                    <YAxis
                        tickFormatter={(value) => `₦${Number(value) / 1000}k`}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                    />
                    <Tooltip content={<ChartTooltipContent indicator="dot" formatter={(value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value))}/>} />
                    <defs>
                        <linearGradient id="fillPortfolioValue" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="5%"
                            stopColor="var(--color-portfolioValue)"
                            stopOpacity={0.8}
                        />
                        <stop
                            offset="95%"
                            stopColor="var(--color-portfolioValue)"
                            stopOpacity={0.1}
                        />
                        </linearGradient>
                    </defs>
                    <Area
                        dataKey="portfolioValue"
                        type="natural"
                        fill="url(#fillPortfolioValue)"
                        fillOpacity={0.4}
                        stroke="var(--color-portfolioValue)"
                        stackId="a"
                    />
                </AreaChart>
            </ChartContainer>
            )}
        </CardContent>
      </Card>


       <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            My Invested Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
                </div>
            ) : isMobile ? (
                <div className="space-y-3">
                    {deals && deals.length > 0 ? deals.map((deal) => (
                        <Card key={deal.id}>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <p className="font-medium">{deal.dealName}</p>
                                    <Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Principal: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Profit Rate: {deal.profitRate}%
                                </div>
                            </CardContent>
                        </Card>
                    )) : (
                        <div className="text-center text-sm text-muted-foreground py-10">You have not invested in any deals yet.</div>
                    )}
                </div>
            ) : (
                <div className="relative w-full overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Deal Name</TableHead>
                                <TableHead>Principal</TableHead>
                                <TableHead>Profit Rate</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!isLoading && deals?.map((deal) => (
                                <TableRow key={deal.id}>
                                    <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
                                    <TableCell data-label="Principal">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                                    <TableCell data-label="Profit Rate">{deal.profitRate}%</TableCell>
                                    <TableCell data-label="Status"><Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge></TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && deals?.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">You have not invested in any deals yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle>Recent Transaction History</CardTitle>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/investor/transactions">
                View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                </div>
            ) : isMobile ? (
                <div className="space-y-3">
                    {recentTransactions && recentTransactions.length > 0 ? recentTransactions.map((tx) => (
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
                    )) : (
                        <div className="text-center text-sm text-muted-foreground py-10">No transactions yet.</div>
                    )}
                </div>
            ) : (
                <div className="relative w-full overflow-auto">
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
                        {!isLoading && recentTransactions?.map((tx) => (
                            <TableRow key={tx.id}>
                            <TableCell data-label="Date">{formatDate(tx.createdAt)}</TableCell>
                            <TableCell data-label="Type">
                                <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                            </TableCell>
                            <TableCell data-label="Details">{tx.dealName || 'N/A'}</TableCell>
                            <TableCell data-label="Amount" className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                            </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && recentTransactions?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No transactions yet.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

    

    
