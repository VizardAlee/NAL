
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Users, AlertTriangle, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Naira } from "@/components/icons";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, Timestamp, DocumentData } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo } from "react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const recentActivities = [
  { id: 1, user: "John Doe", action: "Approved Withdrawal #W001", timestamp: "2 mins ago", type: "Approval" },
  { id: 2, user: "Jane Smith", action: "Lodged Repayment for Deal #D012", timestamp: "15 mins ago", type: "Repayment" },
  { id: 3, user: "Admin", action: "Created new Deal #D024", timestamp: "1 hour ago", type: "Deal" },
  { id: 4, user: "Mike Johnson", action: "Requested Reinvestment of ₦500,000", timestamp: "3 hours ago", type: "Request" },
  { id: 5, user: "Sarah Brown", action: "User profile updated", timestamp: "5 hours ago", type: "User" },
];

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

type User = DocumentData;

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

    const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

    const chartData = useMemo(() => {
        if (!fundBatches) return [];

        // Sort batches by creation date
        const sortedBatches = [...fundBatches].sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

        const monthlyData: { [key: string]: number } = {};

        // Aggregate fund amounts by month
        sortedBatches.forEach(batch => {
            const month = format(batch.createdAt.toDate(), 'yyyy-MM');
            if (!monthlyData[month]) {
                monthlyData[month] = 0;
            }
            monthlyData[month] += batch.amount;
        });

        const chartEntries = Object.keys(monthlyData).map(month => ({
            month: format(new Date(month + '-02'), 'MMM'), // Use a date to format to 'Jan', 'Feb' etc.
            yearMonth: month,
            monthlyTotal: monthlyData[month]
        }));

        // Sort by date and calculate cumulative TVL
        chartEntries.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
        
        let cumulativeTvl = 0;
        return chartEntries.map(entry => {
            cumulativeTvl += entry.monthlyTotal;
            return {
                month: entry.month,
                tvl: cumulativeTvl
            };
        });

    }, [fundBatches]);


  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="A high-level overview of platform-wide metrics."
        icon={LayoutDashboard}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Total Value Locked (TVL)</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                {fundBatchesLoading ? (
                    <div className="h-[250px] w-full flex items-center justify-center">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : (
                 <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <LineChart
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
                            tickFormatter={(value) => `₦${Number(value) / 1000000}M`}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                        />
                        <Tooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    indicator="dot"
                                    formatter={(value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value))}
                                />
                            }
                        />
                        <Line
                            dataKey="tvl"
                            type="natural"
                            stroke="var(--color-tvl)"
                            strokeWidth={2}
                            dot={{
                                fill: "var(--color-tvl)",
                            }}
                            activeDot={{
                                r: 6,
                            }}
                        />
                    </LineChart>
                </ChartContainer>
                )}
            </CardContent>
        </Card>
        <div className="space-y-6">
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Earnings</CardTitle>
                <Naira className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">₦231,580.50</div>
                <p className="text-xs text-muted-foreground">(mock data)</p>
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
                <p className="text-xs text-muted-foreground">Total users on the platform</p>
            </CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue Payments</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">(mock data)</p>
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
              {recentActivities.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">{activity.user}</TableCell>
                  <TableCell>{activity.action}</TableCell>
                  <TableCell className="text-muted-foreground">{activity.timestamp}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{activity.type}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
