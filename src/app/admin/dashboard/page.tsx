
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Users, AlertTriangle, Activity, Briefcase, DollarSign, Zap, TrendingUp, HandCoins } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, Timestamp, DocumentData, where, orderBy, limit } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo } from "react";
import { format, subDays, startOfMonth, subMonths, formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Deal } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const chartConfig = {
    tvl: {
        label: "TVL",
        color: "hsl(var(--primary))",
    },
};

type FundBatch = DocumentData & {
  amount: number;
  createdAt: Timestamp;
};

type User = DocumentData & {
    id: string;
    name: string;
};

type Transaction = DocumentData & {
    id: string;
    userId: string;
    type: string;
    amount: number;
    createdAt: Timestamp;
    dealName?: string;
};

const activityIcons: { [key: string]: React.ElementType } = {
    'Deposit': DollarSign,
    'Investment': Briefcase,
    'ProfitDistribution': TrendingUp,
    'Repayment': HandCoins,
    'PlatformEarning': Zap,
    'Withdrawal': DollarSign,
    'default': Activity
}

export default function AdminDashboardPage() {
    const firestore = useFirestore();

    const fundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        const threeMonthsAgo = startOfMonth(subMonths(new Date(), 2));
        return query(collection(firestore, 'fundBatches'), where('createdAt', '>=', Timestamp.fromDate(threeMonthsAgo)));
    }, [firestore]);
    
    const usersQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const transactionsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(
        collection(firestore, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
    }, [firestore]);
    
    const earningsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(
        collection(firestore, 'transactions'),
        where('type', '==', 'PlatformEarning')
      );
    }, [firestore]);

    const thirtyDaysAgo = useMemo(() => subDays(new Date(), 30), []);
    const overdueDealsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(
        collection(firestore, 'deals'),
        where('status', '==', 'Active'),
        where('createdAt', '<', Timestamp.fromDate(thirtyDaysAgo))
      );
    }, [firestore, thirtyDaysAgo]);


    const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);
    const { data: recentTransactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: earningsTransactions, loading: earningsLoading } = useCollection<Transaction>(earningsQuery);
    const { data: overdueDeals, loading: overdueDealsLoading } = useCollection<Deal>(overdueDealsQuery);
    
    const allUsersResult = useCollection<User>(usersQuery); 

    const isLoading = fundBatchesLoading || usersLoading || transactionsLoading || earningsLoading || overdueDealsLoading || allUsersResult.loading;

    const chartData = useMemo(() => {
        const today = new Date();
        const monthlyData: { [key: string]: number } = {};

        // Initialize the last 3 months with 0 TVL
        for (let i = 0; i < 3; i++) {
            const monthDate = subMonths(today, i);
            const monthKey = format(monthDate, 'yyyy-MM');
            monthlyData[monthKey] = 0;
        }

        if (fundBatches) {
            fundBatches.forEach(batch => {
                const month = format(batch.createdAt.toDate(), 'yyyy-MM');
                if (monthlyData.hasOwnProperty(month)) {
                    monthlyData[month] += batch.amount;
                }
            });
        }

        return Object.keys(monthlyData)
            .map(month => ({
                month: format(new Date(month + '-02'), 'MMM'), // Add day to avoid TZ issues
                tvl: monthlyData[month]
            }))
            .sort((a, b) => new Date(a.month).getMonth() - new Date(b.month).getMonth())
            .reverse();
    }, [fundBatches]);

    const platformEarnings = useMemo(() => {
        if (!earningsTransactions) return 0;
        return earningsTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    }, [earningsTransactions]);

    const recentActivities = useMemo(() => {
        if (!recentTransactions || !allUsersResult.data) return [];
        return recentTransactions.map(tx => {
            const user = allUsersResult.data?.find(u => u.id === tx.userId);
            const amountFormatted = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Math.abs(tx.amount));
            
            let actionText = '';
            switch (tx.type) {
                case 'Deposit': actionText = `deposited ${amountFormatted}.`; break;
                case 'Withdrawal': actionText = `withdrew ${amountFormatted}.`; break;
                case 'Investment': actionText = `invested ${amountFormatted} in "${tx.dealName}".`; break;
                case 'ProfitDistribution': actionText = `earned ${amountFormatted} from "${tx.dealName}".`; break;
                case 'Repayment': actionText = `repaid ${amountFormatted} for "${tx.dealName}".`; break;
                case 'PlatformEarning': actionText = `earned ${amountFormatted} from "${tx.dealName}".`; break;
                default: actionText = `${tx.type} of ${amountFormatted}`;
            }

            return {
                id: tx.id,
                user: user?.name || (tx.userId === 'platform' ? 'Platform' : 'Unknown User'),
                userId: tx.userId,
                action: actionText,
                timestamp: formatDistanceToNow(tx.createdAt.toDate(), { addSuffix: true }),
                type: tx.type,
            };
        });
    }, [recentTransactions, allUsersResult.data]);

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="A high-level overview of platform-wide metrics."
        icon={LayoutDashboard}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-3 overflow-hidden">
          <CardHeader>
            <CardTitle>Total Value Locked (TVL)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="h-80 w-full px-6 pt-6">
                <Skeleton className="h-full w-full rounded-t-xl" />
              </div>
            ) : (
              <div className="h-80 w-full">
                <ChartContainer config={chartConfig}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="fillTvl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-tvl)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="var(--color-tvl)" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
          
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      
                      <XAxis 
                        dataKey="month"
                        tick={{ fontSize: 13 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => 
                          v >= 1_000_000 
                            ? `₦${(v / 1_000_000).toFixed(1)}M`
                            : `₦${(v / 1_000).toFixed(0)}K`
                        }
                      />
          
                      <Tooltip
                        content={<ChartTooltipContent
                          labelFormatter={() => ''}
                          formatter={(value) => 
                            new Intl.NumberFormat('en-NG', { 
                              style: 'currency', 
                              currency: 'NGN' 
                            }).format(Number(value))
                          }
                        />}
                      />
          
                      <Area
                        type="monotone"
                        dataKey="tvl"
                        stroke="var(--color-tvl)"
                        strokeWidth={3}
                        fill="url(#fillTvl)"
                        dot={{ fill: 'var(--color-tvl)', r: 5 }}
                        activeDot={{ r: 7 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-6 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3">
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Earnings</CardTitle>
                <span className="text-muted-foreground font-bold text-lg">₦</span>
            </CardHeader>
            <CardContent>
                {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(platformEarnings)}</div>}
                <div className="text-xs text-muted-foreground">Total accumulated earnings</div>
            </CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {usersLoading ? (
                    <Skeleton className="h-8 w-1/2" />
                ) : (
                    <div className="text-2xl font-bold">{users?.length ?? 0}</div>
                )}
                <div className="text-xs text-muted-foreground">Total users on the platform</div>
            </CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue Payments</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
                {overdueDealsLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{overdueDeals?.length ?? 0}</div>}
                <div className="text-xs text-muted-foreground">Active deals older than 30 days</div>
            </CardContent>
            </Card>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
             {isLoading && Array.from({length: 5}).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/4" />
                    </div>
                </div>
              ))}
              {!isLoading && recentActivities.map((activity) => {
                const Icon = activityIcons[activity.type] || activityIcons['default'];
                return (
                    <div key={activity.id} className="flex items-start gap-4">
                      <Avatar className="h-9 w-9 border hidden md:flex">
                        <AvatarImage src={`https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${activity.userId}`} />
                        <AvatarFallback>{activity.user.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm">
                          <span className="font-medium">{activity.user}</span>
                          <span className="text-muted-foreground"> {activity.action}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.timestamp}
                        </p>
                      </div>
                       <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                       </div>
                    </div>
                )
              })}
              {!isLoading && recentActivities.length === 0 && (
                <div className="h-24 text-center text-sm text-muted-foreground flex items-center justify-center">
                    No recent activity found.
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    