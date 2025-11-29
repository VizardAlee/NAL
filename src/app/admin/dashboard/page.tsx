
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Users, AlertTriangle, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, Timestamp, DocumentData, where, orderBy, limit } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo } from "react";
import { format, subDays, startOfMonth, subMonths } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Deal } from "@/lib/types";

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

export default function AdminDashboardPage() {
    const firestore = useFirestore();

    const fundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'fundBatches'));
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
    
    const activeDealsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(
        collection(firestore, 'deals'),
        where('status', '==', 'Active')
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
    const { data: activeDeals, loading: activeDealsLoading } = useCollection<Deal>(activeDealsQuery);
    const { data: overdueDeals, loading: overdueDealsLoading } = useCollection<Deal>(overdueDealsQuery);
    
    const allUsersResult = useCollection<User>(usersQuery); 

    const isLoading = fundBatchesLoading || usersLoading || transactionsLoading || activeDealsLoading || overdueDealsLoading || allUsersResult.loading;

    const chartData = useMemo(() => {
        const today = new Date();
        const threeMonthsAgo = startOfMonth(subMonths(today, 2));
        const monthlyData: { [key: string]: number } = {};

        // Initialize the last 3 months with 0 TVL
        for (let i = 0; i < 3; i++) {
            const monthDate = subMonths(today, i);
            const monthKey = format(monthDate, 'yyyy-MM');
            monthlyData[monthKey] = 0;
        }

        if (fundBatches) {
            const recentBatches = fundBatches.filter(batch => batch.createdAt.toDate() >= threeMonthsAgo);
            
            recentBatches.forEach(batch => {
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
            .sort((a, b) => a.month.localeCompare(b.month)) // Sort to ensure chronological order if needed, but keys are already sorted
            .reverse(); // To show current month first
    }, [fundBatches]);

    const platformEarnings = useMemo(() => {
        if (!activeDeals) return 0;
        const totalProjectedInterest = activeDeals.reduce((sum, deal) => {
            const interest = deal.principal * (deal.interestRate / 100);
            return sum + interest;
        }, 0);
        return totalProjectedInterest * 0.60; // Platform takes 60% of interest
    }, [activeDeals]);

    const recentActivities = useMemo(() => {
        if (!recentTransactions || !allUsersResult.data) return [];
        return recentTransactions.map(tx => {
            const user = allUsersResult.data?.find(u => u.id === tx.userId);
            const actionText = `${tx.type} of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Math.abs(tx.amount))}${tx.dealName ? ` in ${tx.dealName}`: ''}`;
            return {
                id: tx.id,
                user: user?.name || (tx.userId === 'platform' ? 'Platform' : 'Unknown User'),
                action: actionText,
                timestamp: format(tx.createdAt.toDate(), 'PPp'),
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
        <Card className="lg:col-span-3">
            <CardHeader>
                <CardTitle>Total Value Locked (TVL) by Month</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                {isLoading ? (
                    <div className="h-[250px] w-full flex items-center justify-center">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : (
                 <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <BarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis tickFormatter={(value) => `₦${Number(value) / 1000000}M`} tickLine={false} axisLine={false} tickMargin={8} />
                        <Tooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value))} />} />
                        <Bar dataKey="tvl" fill="var(--color-tvl)" radius={4} />
                    </BarChart>
                </ChartContainer>
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
                <div className="text-xs text-muted-foreground">Projected 60% of interest from active deals</div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({length: 5}).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && recentActivities.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">{activity.user}</TableCell>
                  <TableCell>{activity.action}</TableCell>
                  <TableCell className="text-muted-foreground">{activity.timestamp}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{activity.type}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && recentActivities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No recent activity found.
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
