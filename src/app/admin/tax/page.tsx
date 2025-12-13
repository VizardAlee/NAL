

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
        
        // Tertiary Education Tax (EDT) is 3% of assessable profit (using gross profit here)
        const educationTax = grossProfit * 0.03;
        
        const profitAfterEDT = grossProfit - educationTax;
        
        // Company Income Tax (CIT) is 30% of the remaining profit
        const companyIncomeTax = profitAfterEDT * 0.30;
        
        const profitAfterTax = profitAfterEDT - companyIncomeTax;

        return {
            grossProfit,
            educationTax,
            companyIncomeTax,
            profitAfterTax,
        };

    }, [earningsTransactions, feeTransactions]);

    return (
        <div>
            <PageHeader
                title="Tax Calculation"
                description="Estimate corporate taxes based on platform earnings for a selected period."
                icon={Landmark}
            >
                 <DatePickerWithRange onDateChange={setDateRange} />
            </PageHeader>
            
            {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <TaxMetricCard 
                        title="Gross Profit"
                        value={taxCalculations.grossProfit}
                        description="Platform Earnings + Management Fees"
                        isLoading={isLoading}
                    />
                    <TaxMetricCard 
                        title="Education Tax (EDT)"
                        value={taxCalculations.educationTax}
                        description="3% of Gross Profit"
                        isLoading={isLoading}
                    />
                    <TaxMetricCard 
                        title="Company Income Tax (CIT)"
                        value={taxCalculations.companyIncomeTax}
                        description="30% of Profit after EDT"
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

    