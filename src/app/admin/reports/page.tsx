

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
import { useIsMobile } from "@/hooks/use-mobile";
import { generateAmortizationSchedule } from "@/lib/amortization";

type Transaction = DocumentData & {
  type: 'PlatformEarning' | 'Zakat' | 'Penalty' | 'Investment' | 'Deposit' | 'Withdrawal' | 'ProfitDistribution' | 'Repayment';
  amount: number;
  createdAt: Timestamp;
  dealId?: string;
  userId?: string;
  status?: 'Approved' | 'Pending'; // for repayments
  installmentNumber?: number;
};

type AdministrativeTransaction = DocumentData & {
  type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible' | 'AssetSale' | 'AssetAcquisition' | 'ManagementFee';
  amount: number;
  createdAt: Timestamp;
};

type FundBatch = DocumentData & {
    id: string;
    amount: number;
    remainingAmount: number;
    sourceId: string;
    createdAt: Timestamp;
};

type Deal = DocumentData & {
    id: string;
    principal: number;
    profitRate: number;
    status: 'Active' | 'Pending' | 'Completed' | 'Terminated';
    createdAt: Timestamp;
    startDate: Timestamp;
    durationValue: number;
    durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    repaymentType: 'Equal Installments' | 'Balloon Payment';
    repaymentFrequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly';
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

function MobileReportRow({ label, value, isTotal = false, isNegative = false }: { label: string, value: number, isTotal?: boolean, isNegative?: boolean }) {
    const valueClass = isNegative ? 'text-destructive' : 'text-foreground';
    return (
        <div className={`flex justify-between text-sm ${isTotal ? 'font-bold' : ''}`}>
            <span>{label}</span>
            <span className={valueClass}>{formatCurrency(value)}</span>
        </div>
    );
}

export default function ReportsPage() {
  const firestore = useFirestore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const isMobile = useIsMobile();

  const transactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions')) : null, [firestore]);
  const adminTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'administrativeTransactions')) : null, [firestore]);
  const fundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches')) : null, [firestore]);
  const dealsQuery = useMemo(() => firestore ? query(collection(firestore, 'deals')) : null, [firestore]);
  const assetsQuery = useMemo(() => firestore ? query(collection(firestore, 'assets')) : null, [firestore]);


  const { data: allTransactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
  const { data: allAdminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
  const { data: allFundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: allDeals, loading: allDealsLoading } = useCollection<Deal>(dealsQuery);
  const { data: allAssets, loading: assetsLoading } = useCollection<Asset>(assetsQuery);
  
  const isLoading = transactionsLoading || adminTransactionsLoading || fundBatchesLoading || allDealsLoading || assetsLoading;

  const financialData = useMemo(() => {
    if (isLoading || !allTransactions || !allAdminTransactions || !allFundBatches || !allDeals || !allAssets) {
        return null;
    }

    const to = dateRange?.to ? endOfDay(dateRange.to) : new Date();
    const from = dateRange?.from ? startOfDay(dateRange.from) : null;

    const filterUpToDate = <T extends { createdAt?: Timestamp; acquisitionDate?: Timestamp }>(item: T) => {
        const itemDate = (item.acquisitionDate || item.createdAt)?.toDate();
        if (!itemDate) return false;
        return itemDate <= to;
    };
    
    const filterByDateRange = <T extends { createdAt?: Timestamp; saleDate?: Timestamp, acquisitionDate?: Timestamp }>(item: T) => {
        if (!from) return true;
        const itemDate = (item.saleDate || item.acquisitionDate || item.createdAt)?.toDate();
        if (!itemDate) return false;
        return itemDate >= from && itemDate <= to;
    };

    const transactionsInPeriod = allTransactions.filter(filterByDateRange);
    const adminTransactionsInPeriod = allAdminTransactions.filter(filterByDateRange);

    const activeDeals = allDeals.filter(d => d.status === 'Active' && filterUpToDate(d));
    const heldAssets = allAssets.filter(a => a.status === 'Held' && filterUpToDate(a));
    const transactionsUpToDate = allTransactions.filter(filterUpToDate);
    const adminTransactionsUpToDate = allAdminTransactions.filter(filterUpToDate);
    const fundBatchesUpToDate = allFundBatches.filter(filterUpToDate);
    
    // --- BALANCE SHEET (POINT-IN-TIME SNAPSHOT) ---
    // ASSETS
    const administrativeBalance = adminTransactionsUpToDate.reduce((acc, tx) => acc + tx.amount, 0);
    const totalInvestiblePool = fundBatchesUpToDate.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;
    const cashAndEquivalents = administrativeBalance + totalInvestiblePool;
    const heldAssetValue = heldAssets.reduce((sum, asset) => sum + asset.acquisitionCost, 0);

    let grossFinancingPortfolio = 0;
    let unearnedMarkupRevenue = 0;

    for (const deal of activeDeals) {
        const schedule = generateAmortizationSchedule(deal);
        const approvedRepayments = transactionsUpToDate.filter(
            t => t.dealId === deal.id && t.type === 'Repayment' && t.status === 'Approved'
        );
        const paidInstallmentNumbers = approvedRepayments.map(r => r.installmentNumber).filter(n => n !== undefined);
        const remainingInstallments = schedule.filter(inst => !paidInstallmentNumbers.includes(inst.installment));
        
        const remainingPrincipal = remainingInstallments.reduce((sum, inst) => sum + inst.principal, 0);
        const remainingMarkup = remainingInstallments.reduce((sum, inst) => sum + inst.interest, 0);
        
        grossFinancingPortfolio += (remainingPrincipal + remainingMarkup);
        unearnedMarkupRevenue += remainingMarkup;
    }
    const totalAssets = cashAndEquivalents + grossFinancingPortfolio + heldAssetValue;

    // LIABILITIES & EQUITY
    const investorFundBatches = fundBatchesUpToDate.filter(b => b.sourceId !== 'platform');
    const investorDeposits = transactionsUpToDate.filter(t => t.type === 'Deposit' && investorFundBatches.some(b => b.sourceId === t.userId)).reduce((sum, tx) => sum + tx.amount, 0);
    const investorProfits = transactionsUpToDate.filter(t => t.type === 'ProfitDistribution' && investorFundBatches.some(b => b.sourceId === t.userId)).reduce((sum, tx) => sum + tx.amount, 0);
    const investorWithdrawals = transactionsUpToDate.filter(t => t.type === 'Withdrawal' && investorFundBatches.some(b => b.sourceId === t.userId)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const investorZakat = transactionsUpToDate.filter(t => t.type === 'Zakat' && investorFundBatches.some(b => b.sourceId === t.userId)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const investorInvestments = transactionsUpToDate.filter(t => t.type === 'Investment' && investorFundBatches.some(b => b.sourceId === t.userId)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const investorLiability = (investorDeposits + investorProfits) - (investorWithdrawals + investorZakat + investorInvestments);
    
    const platformEarnings = transactionsUpToDate.filter(t => t.type === 'PlatformEarning').reduce((sum, tx) => sum + tx.amount, 0);
    const managementFees = adminTransactionsUpToDate.filter(t => t.type === 'ManagementFee').reduce((sum, tx) => sum + tx.amount, 0);
    const platformExpenses = adminTransactionsUpToDate.filter(tx => tx.type === 'Expense').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const retainedEarnings = platformEarnings + managementFees - platformExpenses;
    
    const platformCapitalContributions = fundBatchesUpToDate.filter(b => b.sourceId === 'platform').reduce((sum, b) => sum + b.amount, 0);
    const platformInvestments = transactionsUpToDate.filter(t => t.type === 'Investment' && t.userId === 'platform').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const platformEquity = retainedEarnings + platformCapitalContributions - platformInvestments;

    const totalLiabilitiesAndEquity = investorLiability + unearnedMarkupRevenue + platformEquity;
    
    const discrepancy = totalAssets - totalLiabilitiesAndEquity;

    // --- INCOME STATEMENT (FLOW) ---
    const financingRevenue = transactionsInPeriod.filter(t => t.type === 'PlatformEarning').reduce((acc, tx) => acc + tx.amount, 0);
    const managementFeeRevenue = adminTransactionsInPeriod.filter(t => t.type === 'ManagementFee').reduce((acc, tx) => acc + tx.amount, 0);
    const soldAssetsInPeriod = allAssets.filter(a => a.status === 'Sold' && filterByDateRange(a));
    const gainOnAssetSale = soldAssetsInPeriod.reduce((acc, asset) => acc + ((asset.salePrice || 0) - asset.acquisitionCost), 0);
    const totalRevenue = financingRevenue + managementFeeRevenue + gainOnAssetSale;
    const totalExpenses = adminTransactionsInPeriod.filter(t => t.type === 'Expense').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const netIncome = totalRevenue - totalExpenses;

    // --- CASH FLOW (FLOW) ---
    const netCashFromOperations = netIncome;
    const cashFromInvesting = adminTransactionsInPeriod.filter(tx => tx.type === 'AssetSale').reduce((acc, tx) => acc + tx.amount, 0)
                            - adminTransactionsInPeriod.filter(tx => tx.type === 'AssetAcquisition').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
                            - transactionsInPeriod.filter(tx => tx.type === 'Investment').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const cashFromFinancing = transactionsInPeriod.filter(t => t.type === 'Deposit').reduce((acc, tx) => acc + tx.amount, 0)
                            + transactionsInPeriod.filter(t => t.type === 'Repayment').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
                            - transactionsInPeriod.filter(t => t.type === 'Withdrawal').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
                            + adminTransactionsInPeriod.filter(tx => tx.type === 'AdminDeposit' || tx.type === 'TransferFromInvestible').reduce((acc, tx) => acc + tx.amount, 0)
                            - adminTransactionsInPeriod.filter(tx => tx.type === 'TransferToInvestible').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const netCashFlow = netCashFromOperations + cashFromInvesting + cashFromFinancing;

    return {
        balanceSheet: {
            assets: {
                cashAndEquivalents,
                grossFinancingPortfolio,
                totalAssetValue: heldAssetValue,
                totalAssets,
            },
            liabilities: {
                investorLiability,
                unearnedMarkup: unearnedMarkupRevenue,
            },
            equity: {
                platformEquity,
            },
            totalLiabilitiesAndEquity,
            discrepancy,
        },
        incomeStatement: {
            financingRevenue,
            managementFeeRevenue,
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
        { name: 'Cash & Equivalents', value: financialData.balanceSheet.assets.cashAndEquivalents || 0, fill: "hsl(var(--chart-1))" },
        { name: 'Financing Portfolio', value: financialData.balanceSheet.assets.grossFinancingPortfolio || 0, fill: "hsl(var(--chart-2))" },
        { name: 'Held Assets', value: financialData.balanceSheet.assets.totalAssetValue || 0, fill: "hsl(var(--chart-3))" },
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


  if (isLoading || isMobile === undefined) {
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
            <div className="grid gap-6 md:grid-cols-2">
                {isMobile ? (
                    <div className="space-y-4">
                        <Card>
                            <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                <MobileReportRow label="Cash & Equivalents" value={financialData?.balanceSheet.assets.cashAndEquivalents || 0} />
                                <MobileReportRow label="Gross Financing Receivable" value={financialData?.balanceSheet.assets.grossFinancingPortfolio || 0} />
                                <MobileReportRow label="Held Asset Value" value={financialData?.balanceSheet.assets.totalAssetValue || 0} />
                                <Separator className="my-2" />
                                <MobileReportRow label="Total Assets" value={financialData?.balanceSheet.assets.totalAssets || 0} isTotal />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Liabilities & Equity</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                <MobileReportRow label="Net Investor Liability" value={financialData?.balanceSheet.liabilities.investorLiability || 0} />
                                <MobileReportRow label="Unearned Markup Revenue" value={financialData?.balanceSheet.liabilities.unearnedMarkup || 0} />
                                <MobileReportRow label="Platform Equity" value={financialData?.balanceSheet.equity.platformEquity || 0} />
                                <Separator className="my-2" />
                                <MobileReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Balance Sheet</CardTitle>
                            <CardDescription>As of {dateRange?.to ? dateRange.to.toLocaleDateString() : 'today'}.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableBody>
                                    <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Assets</TableCell></TableRow>
                                    <ReportRow label="Cash & Equivalents" value={financialData?.balanceSheet.assets.cashAndEquivalents || 0} isSub />
                                    <ReportRow label="Gross Financing Receivable" value={financialData?.balanceSheet.assets.grossFinancingPortfolio || 0} isSub />
                                    <ReportRow label="Held Asset Value" value={financialData?.balanceSheet.assets.totalAssetValue || 0} isSub />
                                    <ReportRow label="Total Assets" value={financialData?.balanceSheet.assets.totalAssets || 0} isTotal />
                                    
                                    <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Liabilities & Equity</TableCell></TableRow>
                                    <ReportRow label="Net Investor Liability" value={financialData?.balanceSheet.liabilities.investorLiability || 0} isSub />
                                    <ReportRow label="Unearned Markup Revenue" value={financialData?.balanceSheet.liabilities.unearnedMarkup || 0} isSub />
                                    <ReportRow label="Platform Equity" value={financialData?.balanceSheet.equity.platformEquity || 0} isSub />
                                    <ReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>Asset Composition</CardTitle>
                        <CardDescription>A breakdown of the platform's assets.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={{}} className="h-64 w-full">
                           <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={chartData?.assetComposition}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={isMobile ? 60 : 80}
                                        labelLine={!isMobile}
                                        label={isMobile ? ({name}) => name : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
         <TabsContent value="income-statement" className="mt-4">
            <div className="grid gap-6 md:grid-cols-2">
                {isMobile ? (
                    <Card>
                         <CardHeader>
                            <CardTitle>Income Statement</CardTitle>
                            <CardDescription>Performance over the selected period.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <MobileReportRow label="Financing Revenue" value={financialData?.incomeStatement.financingRevenue || 0} />
                            <MobileReportRow label="Management Fee Revenue" value={financialData?.incomeStatement.managementFeeRevenue || 0} />
                            <MobileReportRow label="Gain on Asset Sale" value={financialData?.incomeStatement.gainOnAssetSale || 0} />
                            <Separator className="my-2" />
                            <MobileReportRow label="Total Revenue" value={financialData?.incomeStatement.totalRevenue || 0} isTotal />
                            <MobileReportRow label="Operational Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isNegative />
                             <Separator className="my-2" />
                            <MobileReportRow label="Net Income" value={financialData?.incomeStatement.netIncome || 0} isTotal isNegative={(financialData?.incomeStatement.netIncome || 0) < 0}/>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Income Statement</CardTitle>
                            <CardDescription>Performance over the selected period.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableBody>
                                    <ReportRow label="Financing Revenue (Platform Share)" value={financialData?.incomeStatement.financingRevenue || 0} />
                                    <ReportRow label="Management Fee Revenue" value={financialData?.incomeStatement.managementFeeRevenue || 0} />
                                    <ReportRow label="Gain on Asset Sale" value={financialData?.incomeStatement.gainOnAssetSale || 0} />
                                    <ReportRow label="Total Revenue" value={financialData?.incomeStatement.totalRevenue || 0} isTotal />
                                    <TableRow><TableCell colSpan={2}>&nbsp;</TableCell></TableRow>
                                    <ReportRow label="Operational Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isNegative />
                                    <ReportRow label="Total Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isTotal isNegative />
                                    <TableRow><TableCell colSpan={2}><Separator /></TableCell></TableRow>
                                    <ReportRow label="Net Income" value={financialData?.incomeStatement.netIncome || 0} isTotal isNegative={(financialData?.incomeStatement.netIncome || 0) < 0} />
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue vs Expenses</CardTitle>
                        <CardDescription>A visual comparison of income and expenses.</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
         <TabsContent value="cash-flow" className="mt-4">
             <div className="grid gap-6 md:grid-cols-2">
                {isMobile ? (
                    <Card>
                         <CardHeader>
                            <CardTitle>Cash Flow Statement</CardTitle>
                            <CardDescription>Simplified view of cash movements.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                           <MobileReportRow label="Net Cash from Operations" value={financialData?.cashFlow.netCashFromOperations || 0} isNegative={(financialData?.cashFlow.netCashFromOperations || 0) < 0} />
                           <MobileReportRow label="Net Cash from Investing" value={financialData?.cashFlow.cashFromInvesting || 0} isNegative={(financialData?.cashFlow.cashFromInvesting || 0) < 0} />
                           <MobileReportRow label="Net Cash from Financing" value={financialData?.cashFlow.cashFromFinancing || 0} isNegative={(financialData?.cashFlow.cashFromFinancing || 0) < 0} />
                           <Separator className="my-2" />
                           <MobileReportRow label="Net Change in Cash" value={financialData?.cashFlow.netCashFlow || 0} isTotal isNegative={(financialData?.cashFlow.netCashFlow || 0) < 0} />
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Cash Flow Statement</CardTitle>
                            <CardDescription>Simplified view of cash movements for the selected period.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableBody>
                                    <ReportRow label="Net Cash from Operations" value={financialData?.cashFlow.netCashFromOperations || 0} isNegative={(financialData?.cashFlow.netCashFromOperations || 0) < 0} />
                                    <ReportRow label="Net Cash from Investing" value={financialData?.cashFlow.cashFromInvesting || 0} isNegative={(financialData?.cashFlow.cashFromInvesting || 0) < 0} />
                                    <ReportRow label="Net Cash from Financing" value={financialData?.cashFlow.cashFromFinancing || 0} isNegative={(financialData?.cashFlow.cashFromFinancing || 0) < 0} />
                                    <ReportRow label="Net Change in Cash" value={financialData?.cashFlow.netCashFlow || 0} isTotal isNegative={(financialData?.cashFlow.netCashFlow || 0) < 0} />
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>Cash Flow by Activity</CardTitle>
                        <CardDescription>Sources and uses of cash.</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                </Card>
             </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


