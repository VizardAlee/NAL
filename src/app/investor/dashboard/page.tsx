
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Landmark, History, FileText, Download, Wallet, RefreshCcw, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser, type User } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Deal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WithdrawForm } from "./withdraw-form";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { reinvestAction } from "./actions";
import { useToast } from "@/hooks/use-toast";


type Transaction = DocumentData & {
  id: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution';
  amount: number;
  dealId?: string;
  userId: string;
  createdAt: Timestamp;
  dealName?: string; // Denormalized for display
};

type Investment = DocumentData & {
  investorId: string;
  dealId: string;
  amount: number;
};

const chartConfig = {
  capital: { label: "Capital", color: "hsl(var(--chart-1))" },
  invested: { label: "Invested", color: "hsl(var(--chart-2))" },
  profit: { label: "Profit", color: "hsl(var(--chart-3))" },
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

export default function InvestorDashboard() {
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  const [isWithdrawOpen, setWithdrawOpen] = useState(false);

  const transactionsQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'));
  }, [firestore, user]);
  
  const investmentsQuery = useMemo(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'investments'), where('investorId', '==', user.uid));
  }, [firestore, user]);

  const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);

  const investedDealIds = useMemo(() => {
      return investments?.map(inv => inv.dealId) || [];
  }, [investments]);
  
  const dealsQuery = useMemo(() => {
      if (!firestore || investedDealIds.length === 0) return null;
      return query(collection(firestore, 'deals'), where('__name__', 'in', investedDealIds));
  }, [firestore, investedDealIds]);
  
  const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const isLoading = userLoading || transactionsLoading || investmentsLoading || dealsLoading;

  const financialMetrics = useMemo(() => {
    if (!transactions) {
      return { totalCapital: 0, totalProfit: 0, totalWithdrawn: 0, portfolioValue: 0, withdrawableBalance: 0, simpleROI: 0 };
    }
    const totalCapital = transactions
      .filter(tx => tx.type === 'Deposit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalProfit = transactions
      .filter(tx => tx.type === 'ProfitDistribution')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalWithdrawn = transactions
      .filter(tx => tx.type === 'Withdrawal')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const portfolioValue = (totalCapital + totalProfit) - totalWithdrawn;
    const withdrawableBalance = totalProfit - totalWithdrawn;
    const simpleROI = totalCapital > 0 ? (totalProfit / totalCapital) * 100 : 0;

    return { totalCapital, totalProfit, totalWithdrawn, portfolioValue, withdrawableBalance, simpleROI };
  }, [transactions]);
  
  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    let runningCapital = 0;
    let runningInvested = 0;
    let runningProfit = 0;

    const dataByMonth: { [month: string]: { capital: number; invested: number; profit: number } } = {};

    transactions.forEach(tx => {
        const month = format(tx.createdAt.toDate(), 'yyyy-MM');
        if (!dataByMonth[month]) {
            dataByMonth[month] = { capital: 0, invested: 0, profit: 0 };
        }

        if (tx.type === 'Deposit') runningCapital += tx.amount;
        if (tx.type === 'Withdrawal') runningCapital += tx.amount; // Withdrawals are negative
        if (tx.type === 'Investment') {
            runningInvested += Math.abs(tx.amount);
            runningCapital += tx.amount; // Investments are negative, so this subtracts from capital
        }
        if (tx.type === 'ProfitDistribution') runningProfit += tx.amount;

        dataByMonth[month] = {
            capital: runningCapital,
            invested: runningInvested,
            profit: runningProfit,
        }
    });
    
    return Object.keys(dataByMonth).map(month => ({
        month: format(new Date(month + '-02'), 'MMM yy'), // Add day to avoid timezone issues
        ...dataByMonth[month]
    })).sort((a,b) => a.month.localeCompare(b.month));

}, [transactions]);


  const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try { return format(date, 'PPP'); } catch { return 'Invalid Date'; }
  };


  return (
    <div>
      <PageHeader
        title="Investor Dashboard"
        description="Welcome to your personal investment hub."
        icon={Landmark}
      />

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
            <CardTitle className="text-sm font-medium">Total Capital Deposited</CardTitle>
            <span className="text-muted-foreground font-bold text-lg">₦</span>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.totalCapital)}</div>}
            <p className="text-xs text-muted-foreground">Your total lifetime deposits.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Withdrawable Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(financialMetrics.withdrawableBalance)}</div>}
             <Dialog open={isWithdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full mt-1" disabled={financialMetrics.withdrawableBalance <= 0}>
                  <Download className="mr-2 h-4 w-4"/>
                  Withdraw Funds
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Fund Withdrawal</DialogTitle>
                </DialogHeader>
                <WithdrawForm portfolioValue={financialMetrics.withdrawableBalance} onWithdrawalRequested={() => setWithdrawOpen(false)} />
              </DialogContent>
            </Dialog>
            {user && <ReinvestButton balance={financialMetrics.withdrawableBalance} user={user} />}
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

       <Card className="mt-8">
        <CardHeader>
            <CardTitle>Financial Activity</CardTitle>
            <CardDescription>An overview of your capital, investments, and profit over time.</CardDescription>
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
                    <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Area
                        dataKey="capital"
                        type="natural"
                        fill="var(--color-capital)"
                        fillOpacity={0.4}
                        stroke="var(--color-capital)"
                        stackId="a"
                    />
                    <Area
                        dataKey="invested"
                        type="natural"
                        fill="var(--color-invested)"
                        fillOpacity={0.4}
                        stroke="var(--color-invested)"
                        stackId="a"
                    />
                     <Area
                        dataKey="profit"
                        type="natural"
                        fill="var(--color-profit)"
                        fillOpacity={0.4}
                        stroke="var(--color-profit)"
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
           <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal Name</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Interest Rate</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({length: 1}).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && deals?.map((deal) => (
                 <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.dealName}</TableCell>
                    <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                    <TableCell>{deal.interestRate}%</TableCell>
                    <TableCell><Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge></TableCell>
                 </TableRow>
              ))}
              {!isLoading && deals?.length === 0 && (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">You have not invested in any deals yet.</TableCell></TableRow>
              )}
            </TableBody>
           </Table>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
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
              {isLoading && Array.from({length: 3}).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && transactions?.slice().reverse().map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatDate(tx.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell>{tx.dealName || 'N/A'}</TableCell>
                  <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-green-500' : 'text-foreground'}`}>
                    {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}
               {!isLoading && transactions?.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        No transactions yet.
                    </TableCell>
                </TableRow>
               )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
