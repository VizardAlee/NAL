

'use client';

import { PageHeader } from "@/components/page-header";
import { Library, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfDay, endOfDay } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

type Transaction = DocumentData & {
  type: 'PlatformEarning' | 'Zakat' | 'Penalty' | 'Investment' | 'Deposit' | 'Withdrawal' | 'ProfitDistribution';
  amount: number;
  createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible' | 'AssetSale' | 'AssetAcquisition';
  amount: number;
  createdAt: Timestamp;
};

type FundBatch = DocumentData & {
    amount: number;
    remainingAmount: number;
    sourceId: string;
};

type Deal = DocumentData & {
    principal: number;
    status: 'Active';
    createdAt: Timestamp;
};

type Asset = DocumentData & {
    id: string;
    description: string;
    acquisitionCost: number;
    acquisitionDate: Timestamp;
    status: 'Held' | 'Sold';
    salePrice?: number;
    saleDate?: Timestamp;
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value);
};

const formatCurrencyShort = (value: number) => {
  if (value >= 1_000_000) {
    return `₦${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `₦${(value / 1_000).toFixed(0)}K`;
  }
  return `₦${value.toFixed(0)}`;
};


function ReportRow({ label, value, isTotal = false, isSub = false, isNegative = false }: { label: string, value: number, isTotal?: boolean, isSub?: boolean, isNegative?: boolean }) {
    const valueClass = isNegative ? 'text-destructive' : (isTotal ? '' : 'text-muted-foreground');
    return (
        <TableRow className={isTotal ? 'font-bold' : ''}>
            <TableCell className={isSub ? 'pl-8' : ''}>{label}</TableCell>
            <TableCell className={`text-right ${valueClass}`}>{formatCurrency(value)}</TableCell>
        </TableRow>
    );
}

export default function ReportsPage() {
  const firestore = useFirestore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const transactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions')) : null, [firestore]);
  const adminTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'administrativeTransactions')) : null, [firestore]);
  const fundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches')) : null, [firestore]);
  const dealsQuery = useMemo(() => firestore ? query(collection(firestore, 'deals'), where('status', '==', 'Active')) : null, [firestore]);
  const assetsQuery = useMemo(() => firestore ? query(collection(firestore, 'assets')) : null, [firestore]);


  const { data: allTransactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
  const { data: allAdminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
  const { data: allFundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: allDeals, loading: activeDealsLoading } = useCollection<Deal>(dealsQuery);
  const { data: allAssets, loading: assetsLoading } = useCollection<Asset>(assetsQuery);
  
  const isLoading = transactionsLoading || adminTransactionsLoading || fundBatchesLoading || activeDealsLoading || assetsLoading;

  const financialData = useMemo(() => {
    if (isLoading || !allTransactions || !allAdminTransactions || !allFundBatches || !allDeals || !allAssets) {
        return null;
    }

    const from = dateRange?.from ? startOfDay(dateRange.from) : null;
    const to = dateRange?.to ? endOfDay(dateRange.to) : null;

    const filterByDate = (item: { createdAt?: Timestamp, saleDate?: Timestamp, acquisitionDate?: Timestamp }) => {
        if (!from || !to) return true;
        // Use saleDate for sold assets, otherwise acquisitionDate or createdAt
        const itemDate = (item.saleDate || item.acquisitionDate || item.createdAt)?.toDate();
        if (!itemDate) return false;
        return itemDate >= from && itemDate <= to;
    };
    
    const transactionsInPeriod = allTransactions.filter(filterByDate);
    const adminTransactionsInPeriod = allAdminTransactions.filter(filterByDate);
    
    // Balance sheet items are generally point-in-time, so we use all data up to the 'to' date if it exists
    const filterUpToDate = (item: { createdAt?: Timestamp, acquisitionDate?: Timestamp }) => {
        if (!to) return true;
        const itemDate = (item.acquisitionDate || item.createdAt)?.toDate();
        if (!itemDate) return false;
        return itemDate <= to;
    }

    const fundBatches = allFundBatches.filter(filterUpToDate); 
    const activeDeals = allDeals.filter(filterUpToDate);
    const heldAssets = allAssets.filter(a => a.status === 'Held' && filterUpToDate(a));
    const allTimeAdminTransactions = allAdminTransactions.filter(filterUpToDate);
    const allTimeTransactions = allTransactions.filter(filterUpToDate);

    // --- Balance Sheet Calculations (Point-in-time, uses filterUpToDate) ---
    const cashAndEquivalents = allTimeAdminTransactions.reduce((acc, tx) => acc + tx.amount, 0);
    const grossFinancingPortfolio = activeDeals.reduce((acc, deal) => acc + deal.principal, 0);
    const totalInvestibleCapital = fundBatches.reduce((acc, batch) => acc + batch.remainingAmount, 0);
    const totalAssetValue = heldAssets.reduce((sum, asset) => sum + asset.acquisitionCost, 0);
    const totalAssets = cashAndEquivalents + grossFinancingPortfolio + totalInvestibleCapital + totalAssetValue;

    const investorCapitalDeposited = allTimeTransactions.filter(t => t.type === 'Deposit').reduce((acc, tx) => acc + tx.amount, 0);
    const investorCapitalWithdrawn = allTimeTransactions.filter(t => t.type === 'Withdrawal').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const investorZakatPaid = allTimeTransactions.filter(t => t.type === 'Zakat').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const totalInvestorCapital = investorCapitalDeposited - investorCapitalWithdrawn - investorZakatPaid;

    const platformInvestedCapital = fundBatches.filter(fb => fb.sourceId === 'platform').reduce((acc, batch) => acc + batch.amount, 0);
    const platformRetainedEarnings = allTimeTransactions.filter(t => t.type === 'PlatformEarning').reduce((acc, tx) => acc + tx.amount, 0);
    const totalPlatformEquity = platformInvestedCapital + platformRetainedEarnings;
    const totalLiabilitiesAndEquity = totalInvestorCapital + totalPlatformEquity;
    
    // --- Income Statement Calculations (Flow, uses date filter) ---
    const financingRevenue = transactionsInPeriod.filter(t => t.type === 'PlatformEarning').reduce((acc, tx) => acc + tx.amount, 0);
    const soldAssetsInPeriod = allAssets.filter(a => a.status === 'Sold' && filterByDate(a));
    const gainOnAssetSale = soldAssetsInPeriod.reduce((acc, asset) => acc + ((asset.salePrice || 0) - asset.acquisitionCost), 0);
    const totalRevenue = financingRevenue + gainOnAssetSale;

    const totalExpenses = adminTransactionsInPeriod.filter(t => t.type === 'Expense').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const netIncome = totalRevenue - totalExpenses;


    // --- Cash Flow Calculations (Flow, uses date filter) ---
    const netCashFromOperations = netIncome; // Simplified for now
    const cashFromInvesting = adminTransactionsInPeriod.filter(tx => tx.type === 'AssetSale').reduce((acc, tx) => acc + tx.amount, 0)
                            - adminTransactionsInPeriod.filter(tx => tx.type === 'AssetAcquisition').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
                            - transactionsInPeriod.filter(tx => tx.type === 'Investment').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
                            
    const cashFromFinancing = transactionsInPeriod.filter(t => t.type === 'Deposit').reduce((acc, tx) => acc + tx.amount, 0)
                            - transactionsInPeriod.filter(t => t.type === 'Withdrawal').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
                            + adminTransactionsInPeriod.filter(tx => tx.type === 'AdminDeposit').reduce((acc, tx) => acc + tx.amount, 0);

    const netCashFlow = netCashFromOperations + cashFromInvesting + cashFromFinancing;

    return {
        balanceSheet: {
            assets: {
                cashAndEquivalents,
                grossFinancingPortfolio,
                totalInvestibleCapital,
                totalAssetValue,
                totalAssets,
            },
            liabilities: {
                totalInvestorCapital,
            },
            equity: {
                platformInvestedCapital,
                platformRetainedEarnings,
                totalPlatformEquity,
            },
            totalLiabilitiesAndEquity,
            discrepancy: totalAssets - totalLiabilitiesAndEquity,
        },
        incomeStatement: {
            financingRevenue,
            gainOnAssetSale,
            totalRevenue,
            totalExpenses,
            netIncome
        },
        cashFlow: {
            netCashFromOperations,
            cashFromInvesting,
            cashFromFinancing,
            netCashFlow
        }
    };
  }, [allTransactions, allAdminTransactions, allFundBatches, allDeals, allAssets, isLoading, dateRange]);

  const chartData = useMemo(() => {
    if (!financialData) return null;
    return {
      assetComposition: [
        { name: 'Admin Cash', value: financialData.balanceSheet.assets.cashAndEquivalents, fill: "hsl(var(--chart-1))" },
        { name: 'Financing Portfolio', value: financialData.balanceSheet.assets.grossFinancingPortfolio, fill: "hsl(var(--chart-2))" },
        { name: 'Held Assets', value: financialData.balanceSheet.assets.totalAssetValue, fill: "hsl(var(--chart-3))" },
        { name: 'Investible Capital', value: financialData.balanceSheet.assets.totalInvestibleCapital, fill: "hsl(var(--chart-4))" },
      ].filter(item => item.value > 0),
      income: [
        { name: 'Income', revenue: financialData.incomeStatement.totalRevenue, expenses: financialData.incomeStatement.totalExpenses }
      ],
      cashFlow: [
        { name: 'Operations', value: financialData.cashFlow.netCashFromOperations },
        { name: 'Investing', value: financialData.cashFlow.cashFromInvesting },
        { name: 'Financing', value: financialData.cashFlow.cashFromFinancing },
      ],
    };
  }, [financialData]);


  if (isLoading) {
      return (
          <div>
              <PageHeader
                title="Financial Reports"
                description="Generate and view balance sheets, income statements, and cash flow statements."
                icon={Library}
                />
              <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
          </div>
      )
  }

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        description="A real-time overview of the platform's financial health."
        icon={Library}
      >
        <DatePickerWithRange onDateChange={setDateRange} />
      </PageHeader>

      {financialData?.balanceSheet.discrepancy && Math.abs(financialData.balanceSheet.discrepancy) > 1 && (
        <Card className="mb-6 border-destructive bg-destructive/10">
            <CardHeader className="flex-row gap-4 items-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <div>
                    <CardTitle className="text-destructive">Balance Sheet Discrepancy</CardTitle>
                    <CardDescription className="text-destructive/80">
                        Assets do not equal Liabilities + Equity. The current difference is {formatCurrency(financialData.balanceSheet.discrepancy)}. This indicates a potential data integrity issue that requires investigation.
                    </CardDescription>
                </div>
            </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="balance-sheet">
        <TabsList>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="balance-sheet" className="mt-4">
            <Card>
                <CardHeader>
                    <CardTitle>Balance Sheet</CardTitle>
                    <CardDescription>As of {dateRange?.to ? dateRange.to.toLocaleDateString() : 'today'}.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-8 md:grid-cols-2">
                    <Table>
                        <TableBody>
                            <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Assets</TableCell></TableRow>
                            <ReportRow label="Cash & Equivalents (Admin)" value={financialData?.balanceSheet.assets.cashAndEquivalents || 0} isSub />
                            <ReportRow label="Gross Financing Portfolio (Active Deals)" value={financialData?.balanceSheet.assets.grossFinancingPortfolio || 0} isSub />
                            <ReportRow label="Held Asset Value" value={financialData?.balanceSheet.assets.totalAssetValue || 0} isSub />
                            <ReportRow label="Total Investible Capital (Uninvested)" value={financialData?.balanceSheet.assets.totalInvestibleCapital || 0} isSub />
                            <ReportRow label="Total Assets" value={financialData?.balanceSheet.assets.totalAssets || 0} isTotal />
                            
                            <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Liabilities & Equity</TableCell></TableRow>
                            <ReportRow label="Investor Capital" value={financialData?.balanceSheet.liabilities.totalInvestorCapital || 0} isSub />
                            <ReportRow label="Platform Equity" value={financialData?.balanceSheet.equity.totalPlatformEquity || 0} isSub />
                            <ReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                        </TableBody>
                    </Table>
                    <div className="flex flex-col items-center justify-center">
                        <h3 className="mb-4 text-center font-medium">Asset Composition</h3>
                         <ChartContainer config={{}} className="h-64 w-full">
                           <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={chartData?.assetComposition}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                    {chartData?.assetComposition.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                    </Pie>
                                     <Tooltip
                                        content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />}
                                    />
                                    <Legend />
                                </PieChart>
                           </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
         <TabsContent value="income-statement" className="mt-4">
            <Card>
                <CardHeader>
                    <CardTitle>Income Statement</CardTitle>
                    <CardDescription>Performance over the selected period.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-8 md:grid-cols-2">
                     <Table>
                        <TableBody>
                            <ReportRow label="Financing Revenue" value={financialData?.incomeStatement.financingRevenue || 0} />
                            <ReportRow label="Gain on Asset Sale" value={financialData?.incomeStatement.gainOnAssetSale || 0} />
                            <ReportRow label="Total Revenue" value={financialData?.incomeStatement.totalRevenue || 0} isTotal />
                            <TableRow><TableCell colSpan={2}>&nbsp;</TableCell></TableRow>
                            <ReportRow label="Operational Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isNegative />
                            <ReportRow label="Total Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isTotal isNegative />
                             <TableRow><TableCell colSpan={2}><Separator /></TableCell></TableRow>
                            <ReportRow label="Net Income" value={financialData?.incomeStatement.netIncome || 0} isTotal />
                        </TableBody>
                    </Table>
                     <div className="flex flex-col items-center justify-center">
                         <h3 className="mb-4 text-center font-medium">Revenue vs Expenses</h3>
                         <ChartContainer config={{}} className="h-64 w-full">
                            <ResponsiveContainer>
                                <BarChart data={chartData?.income} margin={{ top: 20 }}>
                                    <XAxis dataKey="name" stroke="hsl(var(--foreground))" />
                                    <YAxis stroke="hsl(var(--foreground))" tickFormatter={formatCurrencyShort} />
                                    <Tooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />} />
                                    <Legend />
                                    <Bar dataKey="revenue" fill="hsl(var(--chart-1))" name="Revenue" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Expenses" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
         <TabsContent value="cash-flow" className="mt-4">
             <Card>
                <CardHeader>
                    <CardTitle>Cash Flow Statement</CardTitle>
                    <CardDescription>Simplified view of cash movements for the selected period.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-8 md:grid-cols-2">
                     <Table>
                        <TableBody>
                            <ReportRow label="Net Cash from Operations" value={financialData?.cashFlow.netCashFromOperations || 0} />
                            <ReportRow label="Net Cash from Investing" value={financialData?.cashFlow.cashFromInvesting || 0} />
                            <ReportRow label="Net Cash from Financing" value={financialData?.cashFlow.cashFromFinancing || 0} />
                            <ReportRow label="Net Change in Cash" value={financialData?.cashFlow.netCashFlow || 0} isTotal />
                        </TableBody>
                    </Table>
                    <div className="flex flex-col items-center justify-center">
                         <h3 className="mb-4 text-center font-medium">Cash Flow by Activity</h3>
                         <ChartContainer config={{}} className="h-64 w-full">
                            <ResponsiveContainer>
                                <BarChart data={chartData?.cashFlow} margin={{ top: 20 }}>
                                    <XAxis dataKey="name" stroke="hsl(var(--foreground))" />
                                    <YAxis stroke="hsl(var(--foreground))" tickFormatter={formatCurrencyShort}/>
                                    <Tooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />} />
                                    <Bar dataKey="value" name="Cash Flow" radius={[4, 4, 0, 0]}>
                                        {chartData?.cashFlow.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.value >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
