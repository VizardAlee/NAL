

'use client';

import { PageHeader } from "@/components/page-header";
import { Library, AlertTriangle, Loader2, CalendarIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfDay, endOfDay, format } from "date-fns";
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
    ownerAllocatable?: boolean;
    ownerAllocationId?: string;
    sourceType?: string;
    details?: string;
    platformEarningKind?: 'Operating' | 'OwnerDistributionAdjustment' | 'InterAccountAdjustment';
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

type Investment = DocumentData & {
    id: string;
    investorId: string;
    dealId: string;
    amount: number;
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
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const isMobile = useIsMobile();

    const transactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions')) : null, [firestore]);
    const adminTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'administrativeTransactions')) : null, [firestore]);
    const allFundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches')) : null, [firestore]);
    const dealsQuery = useMemo(() => firestore ? query(collection(firestore, 'deals')) : null, [firestore]);
    const assetsQuery = useMemo(() => firestore ? query(collection(firestore, 'assets')) : null, [firestore]);
    const investmentsQuery = useMemo(() => firestore ? query(collection(firestore, 'investments')) : null, [firestore]);


    const { data: allTransactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: allAdminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    const { data: allFundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(allFundBatchesQuery);
    const { data: allDeals, loading: allDealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: allAssets, loading: assetsLoading } = useCollection<Asset>(assetsQuery);
    const { data: allInvestments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);

    const isLoading = transactionsLoading || adminTransactionsLoading || fundBatchesLoading || allDealsLoading || assetsLoading || investmentsLoading;

    const financialData = useMemo(() => {
        if (isLoading || !allTransactions || !allAdminTransactions || !allFundBatches || !allDeals || !allAssets || !allInvestments) {
            return null;
        }

        const to = endDate ? endOfDay(endDate) : new Date();
        const from = startDate ? startOfDay(startDate) : null;

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
        const transactionsUpToDate = allTransactions.filter(filterUpToDate);

        const activeDeals = allDeals.filter(d => d.status === 'Active' && filterUpToDate(d));
        const heldAssets = allAssets.filter(a => a.status === 'Held' && filterUpToDate(a));
        const adminTransactionsUpToDate = allAdminTransactions.filter(filterUpToDate);
        const fundBatchesUpToDate = allFundBatches.filter(filterUpToDate);


        // --- BALANCE SHEET (POINT-IN-TIME SNAPSHOT) ---
        // ASSETS
        const administrativeBalance = adminTransactionsUpToDate.reduce((acc, tx) => acc + tx.amount, 0);
        const totalInvestiblePool = fundBatchesUpToDate.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;
        const cashAndEquivalents = administrativeBalance + totalInvestiblePool;

        const heldAssetValue = heldAssets.reduce((sum, asset) => sum + asset.acquisitionCost, 0);

        let grossFinancingPortfolio = 0;
        let outstandingPrincipal = 0;
        let unearnedMarkupRevenue = 0;

        for (const deal of activeDeals) {
            const schedule = generateAmortizationSchedule(deal as unknown as import('@/lib/types').Deal);
            const approvedRepayments = transactionsUpToDate.filter(
                t => t.dealId === deal.id && t.type === 'Repayment' && t.status === 'Approved'
            );
            const paidInstallmentNumbers = approvedRepayments.map(r => r.installmentNumber).filter(n => n !== undefined);
            const remainingInstallments = schedule.filter(inst => !paidInstallmentNumbers.includes(inst.installment));

            grossFinancingPortfolio += remainingInstallments.reduce((sum, inst) => sum + inst.payment, 0);
            outstandingPrincipal += remainingInstallments.reduce((sum, inst) => sum + inst.principal, 0);
            unearnedMarkupRevenue += remainingInstallments.reduce((sum, inst) => sum + inst.interest, 0);
        }
        const totalAssets = cashAndEquivalents + grossFinancingPortfolio + heldAssetValue;

        // LIABILITIES & EQUITY
        const investorFundBatches = fundBatchesUpToDate.filter(b => b.sourceId !== 'platform');
        const investorUninvestedCapital = investorFundBatches.reduce((sum, batch) => sum + batch.remainingAmount, 0);

        let principalPayableToInvestors = 0;
        let principalPayableToPlatform = 0;
        for (const deal of activeDeals) {
            const investmentsForDeal = allInvestments.filter(inv => inv.dealId === deal.id);
            const totalInvestedInDeal = investmentsForDeal.reduce((sum, inv) => sum + inv.amount, 0);
            if (totalInvestedInDeal === 0) continue;

            const schedule = generateAmortizationSchedule(deal as unknown as import('@/lib/types').Deal);
            const approvedRepayments = transactionsUpToDate.filter(t => t.dealId === deal.id && t.type === 'Repayment' && t.status === 'Approved');
            const paidInstallmentNumbers = approvedRepayments.map(r => r.installmentNumber).filter(n => n !== undefined);
            const remainingInstallments = schedule.filter(inst => !paidInstallmentNumbers.includes(inst.installment));
            const outstandingPrincipalForDeal = remainingInstallments.reduce((sum, inst) => sum + inst.principal, 0);

            for (const investment of investmentsForDeal) {
                const proportion = investment.amount / totalInvestedInDeal;
                if (investment.investorId === 'platform') {
                    principalPayableToPlatform += outstandingPrincipalForDeal * proportion;
                } else {
                    principalPayableToInvestors += outstandingPrincipalForDeal * proportion;
                }
            }
        }

        const markupPayableToInvestors = unearnedMarkupRevenue * 0.40;
        const unearnedPlatformMarkup = unearnedMarkupRevenue * 0.60;

        const platformFundBatches = fundBatchesUpToDate.filter(b => b.sourceId === 'platform');
        const platformUninvestedCapital = platformFundBatches.reduce((sum, batch) => sum + batch.remainingAmount, 0);

        // Corrected Retained Earnings: only includes income/expenses from the administrative account.
        // PlatformEarning from deals is already reflected in the platform's fund batches.
        const retainedEarnings = adminTransactionsUpToDate.filter(t => t.type === 'ManagementFee' || t.type === 'AssetSale').reduce((sum, tx) => sum + tx.amount, 0)
            - adminTransactionsUpToDate.filter(t => t.type === 'Expense' || t.type === 'AssetAcquisition').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);


        const totalLiabilitiesAndEquity = investorUninvestedCapital + principalPayableToInvestors + markupPayableToInvestors
            + platformUninvestedCapital + principalPayableToPlatform + unearnedPlatformMarkup + retainedEarnings;

        const discrepancy = totalAssets - totalLiabilitiesAndEquity;

        // --- INCOME STATEMENT (FLOW) ---
        const financingRevenue = transactionsInPeriod
            .filter((tx) => {
                if (tx.type !== 'PlatformEarning' || tx.amount <= 0) return false;
                if (tx.platformEarningKind) return tx.platformEarningKind === 'Operating';
                return tx.ownerAllocatable !== false && !tx.ownerAllocationId;
            })
            .reduce((acc, tx) => acc + tx.amount, 0);
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
        const externalDeposits = transactionsInPeriod
            .filter((tx) => {
                if (tx.type !== 'Deposit') return false;
                if (tx.sourceType === 'OwnerProfitAutoAllocation') return false;
                if (tx.ownerAllocationId) return false;
                if (typeof tx.details === 'string' && tx.details.includes('Owner profit allocation')) return false;
                return true;
            })
            .reduce((acc, tx) => acc + tx.amount, 0);

        const cashFromFinancing = externalDeposits
            + transactionsInPeriod.filter(t => t.type === 'Repayment' && t.status === 'Approved').reduce((acc, tx) => acc + Math.abs(tx.amount), 0)
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
                    investorUninvestedCapital,
                    principalPayableToInvestors,
                    markupPayableToInvestors,
                },
                equity: {
                    platformUninvestedCapital,
                    principalPayableToPlatform,
                    unearnedPlatformMarkup,
                    retainedEarnings,
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
    }, [allTransactions, allAdminTransactions, allFundBatches, allDeals, allAssets, allInvestments, isLoading, startDate, endDate]);

    const chartData = useMemo(() => {
        if (!financialData) return null;
        return {
            assetComposition: [
                { name: 'Cash & Equivalents', value: financialData.balanceSheet.assets.cashAndEquivalents || 0, fill: "hsl(var(--chart-1))" },
                { name: 'Financing Receivable', value: financialData.balanceSheet.assets.grossFinancingPortfolio || 0, fill: "hsl(var(--chart-2))" },
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

    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

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
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn("w-[140px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formatDateDisplay(startDate)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                            <Calendar
                                mode="single"
                                selected={startDate ?? undefined}
                                onSelect={(date) => {
                                    if (!date) return;
                                    setStartDate(date);
                                    if (endDate && date > endDate) {
                                        setEndDate(date);
                                    }
                                }}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground">-</span>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn("w-[140px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formatDateDisplay(endDate)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="end">
                            <Calendar
                                mode="single"
                                selected={endDate ?? undefined}
                                disabled={(date) => (startDate ? date < startOfDay(startDate) : false)}
                                onSelect={(date) => {
                                    if (!date) return;
                                    setEndDate(date);
                                }}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
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
                    <div className="grid gap-6">
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
                                        <p className="font-medium text-sm">Investor Liabilities</p>
                                        <MobileReportRow label="Uninvested Capital" value={financialData?.balanceSheet.liabilities.investorUninvestedCapital || 0} />
                                        <MobileReportRow label="Principal Payable" value={financialData?.balanceSheet.liabilities.principalPayableToInvestors || 0} />
                                        <MobileReportRow label="Markup Payable" value={financialData?.balanceSheet.liabilities.markupPayableToInvestors || 0} />
                                        <Separator className="my-2" />
                                        <p className="font-medium text-sm">Platform Equity</p>
                                        <MobileReportRow label="Uninvested Capital" value={financialData?.balanceSheet.equity.platformUninvestedCapital || 0} />
                                        <MobileReportRow label="Principal in Deals" value={financialData?.balanceSheet.equity.principalPayableToPlatform || 0} />
                                        <MobileReportRow label="Unearned Markup" value={financialData?.balanceSheet.equity.unearnedPlatformMarkup || 0} />
                                        <MobileReportRow label="Retained Earnings" value={financialData?.balanceSheet.equity.retainedEarnings || 0} />
                                        <Separator className="my-2" />
                                        <MobileReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Balance Sheet</CardTitle>
                                    <CardDescription>
                                        {endDate ? `As of ${format(endDate, "PPP")}` : 'As of today'}
                                    </CardDescription>
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
                                            <TableRow className="font-medium text-base"><TableCell colSpan={2}>Investor Liabilities</TableCell></TableRow>
                                            <ReportRow label="Uninvested Capital" value={financialData?.balanceSheet.liabilities.investorUninvestedCapital || 0} isSub />
                                            <ReportRow label="Principal Payable to Investors" value={financialData?.balanceSheet.liabilities.principalPayableToInvestors || 0} isSub />
                                            <ReportRow label="Markup Payable to Investors" value={financialData?.balanceSheet.liabilities.markupPayableToInvestors || 0} isSub />

                                            <TableRow className="font-medium text-base"><TableCell colSpan={2}>Platform Equity</TableCell></TableRow>
                                            <ReportRow label="Uninvested Capital" value={financialData?.balanceSheet.equity.platformUninvestedCapital || 0} isSub />
                                            <ReportRow label="Principal in Deals" value={financialData?.balanceSheet.equity.principalPayableToPlatform || 0} isSub />
                                            <ReportRow label="Unearned Platform Markup" value={financialData?.balanceSheet.equity.unearnedPlatformMarkup || 0} isSub />
                                            <ReportRow label="Retained Earnings" value={financialData?.balanceSheet.equity.retainedEarnings || 0} isSub />

                                            <ReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>
                <TabsContent value="income-statement" className="mt-4">
                    <div className="grid gap-6 md:grid-cols-2">
                        {isMobile ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Income Statement</CardTitle>
                                    <CardDescription>
                                        {startDate && endDate ? `For the period ${format(startDate, "PPP")} to ${format(endDate, "PPP")}` : 'For the current period'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <MobileReportRow label="Financing Revenue" value={financialData?.incomeStatement.financingRevenue || 0} />
                                    <MobileReportRow label="Management Fee Revenue" value={financialData?.incomeStatement.managementFeeRevenue || 0} />
                                    <MobileReportRow label="Gain on Asset Sale" value={financialData?.incomeStatement.gainOnAssetSale || 0} />
                                    <Separator className="my-2" />
                                    <MobileReportRow label="Total Revenue" value={financialData?.incomeStatement.totalRevenue || 0} isTotal />
                                    <MobileReportRow label="Operational Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isNegative />
                                    <Separator className="my-2" />
                                    <MobileReportRow label="Net Income" value={financialData?.incomeStatement.netIncome || 0} isTotal isNegative={(financialData?.incomeStatement.netIncome || 0) < 0} />
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Income Statement</CardTitle>
                                    <CardDescription>
                                        {startDate && endDate ? `For the period ${format(startDate, "PPP")} to ${format(endDate, "PPP")}` : 'For the current period'}
                                    </CardDescription>
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
                                    <CardDescription>
                                        {startDate && endDate ? `For the period ${format(startDate, "PPP")} to ${format(endDate, "PPP")}` : 'For the current period'}
                                    </CardDescription>
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
                                    <CardDescription>
                                        {startDate && endDate ? `For the period ${format(startDate, "PPP")} to ${format(endDate, "PPP")}` : 'For the current period'}
                                    </CardDescription>
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
                                            <YAxis stroke="hsl(var(--foreground))" tickFormatter={formatCurrencyShort} />
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
