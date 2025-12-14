
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore } from "@/firebase";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { Landmark, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { startOfDay, endOfDay } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Transaction = DocumentData & {
  type: 'PlatformEarning';
  amount: number;
  createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  type: 'ManagementFee';
  amount: number;
  createdAt: Timestamp;
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value);
};

function TaxMetricCard({ title, value, description, isLoading }: { title: string, value: number, description?: string, isLoading: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(value)}</div>}
            </CardContent>
        </Card>
    );
}

export default function TaxPage() {
    const firestore = useFirestore();
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'transactions'), where('type', '==', 'PlatformEarning'));
        if (dateRange?.from) q = query(q, where('createdAt', '>=', startOfDay(dateRange.from)));
        if (dateRange?.to) q = query(q, where('createdAt', '<=', endOfDay(dateRange.to)));
        return q;
    }, [firestore, dateRange]);

    const adminTransactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'administrativeTransactions'), where('type', '==', 'ManagementFee'));
        if (dateRange?.from) q = query(q, where('createdAt', '>=', startOfDay(dateRange.from)));
        if (dateRange?.to) q = query(q, where('createdAt', '<=', endOfDay(dateRange.to)));
        return q;
    }, [firestore, dateRange]);

    const { data: earningsTransactions, loading: earningsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: feeTransactions, loading: feesLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    
    const isLoading = earningsLoading || feesLoading;
    
    const taxCalculations = useMemo(() => {
        const platformEarnings = earningsTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        const managementFees = feeTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        
        const grossProfit = platformEarnings + managementFees;
        
        // Personal Income Tax (PIT) for Enterprises
        // 1. Calculate Consolidated Relief Allowance (CRA)
        const cra = Math.max(200000, grossProfit * 0.01) + (grossProfit * 0.20);
        
        // 2. Determine Chargeable Income
        const chargeableIncome = Math.max(0, grossProfit - cra);
        
        // 3. Apply Progressive Tax Rates
        let personalIncomeTax = 0;
        let incomeLeft = chargeableIncome;
        
        if (incomeLeft > 0) {
            const firstBracket = Math.min(incomeLeft, 300000);
            personalIncomeTax += firstBracket * 0.07;
            incomeLeft -= firstBracket;
        }
        if (incomeLeft > 0) {
            const secondBracket = Math.min(incomeLeft, 300000);
            personalIncomeTax += secondBracket * 0.11;
            incomeLeft -= secondBracket;
        }
        if (incomeLeft > 0) {
            const thirdBracket = Math.min(incomeLeft, 500000);
            personalIncomeTax += thirdBracket * 0.15;
            incomeLeft -= thirdBracket;
        }
        if (incomeLeft > 0) {
            const fourthBracket = Math.min(incomeLeft, 500000);
            personalIncomeTax += fourthBracket * 0.19;
            incomeLeft -= fourthBracket;
        }
        if (incomeLeft > 0) {
            const fifthBracket = Math.min(incomeLeft, 1600000);
            personalIncomeTax += fifthBracket * 0.21;
            incomeLeft -= fifthBracket;
        }
        if (incomeLeft > 0) {
            personalIncomeTax += incomeLeft * 0.24;
        }

        const profitAfterTax = grossProfit - personalIncomeTax;

        return {
            grossProfit,
            cra,
            chargeableIncome,
            personalIncomeTax,
            profitAfterTax,
        };

    }, [earningsTransactions, feeTransactions]);

    return (
        <div>
            <PageHeader
                title="Tax Calculation (Enterprise)"
                description="Estimate Personal Income Tax (PIT) based on platform profits for a selected period."
                icon={Landmark}
            >
                 <DatePickerWithRange onDateChange={setDateRange} />
            </PageHeader>
            
            {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Personal Income Tax (PIT) Estimation</CardTitle>
                            <CardDescription>Based on Nigerian PITA rates for enterprise businesses.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>Gross Profit</TableCell>
                                        <TableCell className="text-right">{formatCurrency(taxCalculations.grossProfit)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>Consolidated Relief Allowance (CRA)</TableCell>
                                        <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.cra)}</TableCell>
                                    </TableRow>
                                    <TableRow className="font-medium bg-muted/50">
                                        <TableCell>Chargeable Income</TableCell>
                                        <TableCell className="text-right">{formatCurrency(taxCalculations.chargeableIncome)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                     <TaxMetricCard 
                        title="Estimated Personal Income Tax (PIT)"
                        value={taxCalculations.personalIncomeTax}
                        description="Calculated based on progressive rates"
                        isLoading={isLoading}
                    />
                    <TaxMetricCard 
                        title="Profit After Tax"
                        value={taxCalculations.profitAfterTax}
                        description="Remaining profit after all taxes"
                        isLoading={isLoading}
                    />
                </div>
            )}
        </div>
    );
}
