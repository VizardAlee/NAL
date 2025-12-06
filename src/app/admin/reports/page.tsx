
'use client';

import { PageHeader } from "@/components/page-header";
import { Library, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, DocumentData, Timestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

type Transaction = DocumentData & {
  type: 'PlatformEarning' | 'Zakat' | 'Penalty' | 'Investment' | 'Deposit' | 'Withdrawal' | 'ProfitDistribution';
  amount: number;
  createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible';
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
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value);
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

  const transactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions')) : null, [firestore]);
  const adminTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'administrativeTransactions')) : null, [firestore]);
  const fundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches')) : null, [firestore]);
  const activeDealsQuery = useMemo(() => firestore ? query(collection(firestore, 'deals'), where('status', '==', 'Active')) : null, [firestore]);

  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);
  const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: activeDeals, loading: activeDealsLoading } = useCollection<Deal>(activeDealsQuery);
  
  const isLoading = transactionsLoading || adminTransactionsLoading || fundBatchesLoading || activeDealsLoading;

  const financialData = useMemo(() => {
    if (isLoading || !transactions || !adminTransactions || !fundBatches || !activeDeals) {
        return null;
    }

    // --- Balance Sheet Calculations ---
    const cashAndEquivalents = adminTransactions.reduce((acc, tx) => acc + tx.amount, 0);
    const grossFinancingPortfolio = activeDeals.reduce((acc, deal) => acc + deal.principal, 0);
    const totalInvestibleCapital = fundBatches.reduce((acc, batch) => acc + batch.remainingAmount, 0);
    const totalAssets = cashAndEquivalents + grossFinancingPortfolio + totalInvestibleCapital;

    const investorCapitalDeposited = transactions.filter(t => t.type === 'Deposit').reduce((acc, tx) => acc + tx.amount, 0);
    const investorCapitalWithdrawn = transactions.filter(t => t.type === 'Withdrawal').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const investorZakatPaid = transactions.filter(t => t.type === 'Zakat').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const totalInvestorCapital = investorCapitalDeposited - investorCapitalWithdrawn - investorZakatPaid;

    const platformInvestedCapital = fundBatches.filter(fb => fb.sourceId === 'platform').reduce((acc, batch) => acc + batch.amount, 0);
    const platformRetainedEarnings = transactions.filter(t => t.type === 'PlatformEarning').reduce((acc, tx) => acc + tx.amount, 0);
    const totalPlatformEquity = platformInvestedCapital + platformRetainedEarnings;
    const totalLiabilitiesAndEquity = totalInvestorCapital + totalPlatformEquity;
    
    // --- Income Statement Calculations ---
    const totalRevenue = platformRetainedEarnings; // Platform Earnings are the primary revenue
    const totalExpenses = 0; // No direct expenses tracked in this model yet
    const netIncome = totalRevenue - totalExpenses;

    // --- Cash Flow Calculations ---
    const netCashFromOperations = netIncome; // Simplified: starts with Net Income
    const cashFromInvesting = -transactions.filter(tx => tx.type === 'Investment').reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    const cashFromFinancing = investorCapitalDeposited - investorCapitalWithdrawn;
    const netCashFlow = netCashFromOperations + cashFromInvesting + cashFromFinancing;

    return {
        balanceSheet: {
            assets: {
                cashAndEquivalents,
                grossFinancingPortfolio,
                totalInvestibleCapital,
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
  }, [transactions, adminTransactions, fundBatches, activeDeals, isLoading]);

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
      />

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

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>As of today</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableBody>
                        <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Assets</TableCell></TableRow>
                        <ReportRow label="Cash & Equivalents (Admin)" value={financialData?.balanceSheet.assets.cashAndEquivalents || 0} isSub />
                        <ReportRow label="Gross Financing Portfolio (Active Deals)" value={financialData?.balanceSheet.assets.grossFinancingPortfolio || 0} isSub />
                        <ReportRow label="Total Investible Capital (Uninvested)" value={financialData?.balanceSheet.assets.totalInvestibleCapital || 0} isSub />
                        <ReportRow label="Total Assets" value={financialData?.balanceSheet.assets.totalAssets || 0} isTotal />
                        
                        <TableRow className="font-semibold text-lg bg-muted/50"><TableCell colSpan={2}>Liabilities & Equity</TableCell></TableRow>
                        <ReportRow label="Investor Capital" value={financialData?.balanceSheet.liabilities.totalInvestorCapital || 0} isSub />
                        <ReportRow label="Platform Equity" value={financialData?.balanceSheet.equity.totalPlatformEquity || 0} isSub />
                        <ReportRow label="Total Liabilities & Equity" value={financialData?.balanceSheet.totalLiabilitiesAndEquity || 0} isTotal />
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Income Statement</CardTitle>
                    <CardDescription>Cumulative performance</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableBody>
                            <ReportRow label="Total Revenue (Platform Earnings)" value={financialData?.incomeStatement.totalRevenue || 0} />
                            <ReportRow label="Total Expenses" value={financialData?.incomeStatement.totalExpenses || 0} isNegative />
                            <ReportRow label="Net Income" value={financialData?.incomeStatement.netIncome || 0} isTotal />
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Cash Flow Statement</CardTitle>
                    <CardDescription>Simplified view of cash movements</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableBody>
                            <ReportRow label="Net Cash from Operations" value={financialData?.cashFlow.netCashFromOperations || 0} />
                            <ReportRow label="Net Cash from Investing" value={financialData?.cashFlow.cashFromInvesting || 0} isNegative />
                            <ReportRow label="Net Cash from Financing" value={financialData?.cashFlow.cashFromFinancing || 0} />
                            <ReportRow label="Net Change in Cash" value={financialData?.cashFlow.netCashFlow || 0} isTotal />
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
