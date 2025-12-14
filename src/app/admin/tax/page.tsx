
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore } from "@/firebase";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { Landmark, Loader2, CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


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
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'transactions'), where('type', '==', 'PlatformEarning'));
        if (startDate) q = query(q, where('createdAt', '>=', startOfDay(startDate)));
        if (endDate) q = query(q, where('createdAt', '<=', endOfDay(endDate)));
        return q;
    }, [firestore, startDate, endDate]);

    const adminTransactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'administrativeTransactions'), where('type', '==', 'ManagementFee'));
        if (startDate) q = query(q, where('createdAt', '>=', startOfDay(startDate)));
        if (endDate) q = query(q, where('createdAt', '<=', endOfDay(endDate)));
        return q;
    }, [firestore, startDate, endDate]);

    const { data: earningsTransactions, loading: earningsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: feeTransactions, loading: feesLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    
    const isLoading = earningsLoading || feesLoading;
    
    const taxCalculations = useMemo(() => {
        const platformEarnings = earningsTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        const managementFees = feeTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        
        const grossProfit = platformEarnings + managementFees;
        
        // Consolidated Relief Allowance (CRA)
        const cra = Math.max(200000, grossProfit * 0.01) + (grossProfit * 0.20);
        const chargeableIncome = Math.max(0, grossProfit - cra);
        
        let personalIncomeTax = 0;
        let incomeLeft = chargeableIncome;
        const taxBreakdown = [];
        
        // New Proposed Tax Brackets
        const brackets = [
            { limit: 2000000, rate: 0.10 }, // 10% on the first 2m
            { limit: 2000000, rate: 0.20 }, // 20% on the next 2m
            { limit: Infinity, rate: 0.30 },  // 30% on the remainder
        ];

        for (const bracket of brackets) {
            if (incomeLeft <= 0) break;
            const taxableInBracket = Math.min(incomeLeft, bracket.limit);
            const taxForBracket = taxableInBracket * bracket.rate;
            personalIncomeTax += taxForBracket;
            taxBreakdown.push({
                rate: bracket.rate * 100,
                amount: taxableInBracket,
                tax: taxForBracket
            });
            incomeLeft -= taxableInBracket;
        }

        const profitAfterTax = grossProfit - personalIncomeTax;

        return {
            grossProfit,
            cra,
            chargeableIncome,
            personalIncomeTax,
            profitAfterTax,
            taxBreakdown,
        };

    }, [earningsTransactions, feeTransactions]);
    
    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

    return (
        <div>
            <PageHeader
                title="Tax Calculation (Enterprise)"
                description="Estimate Personal Income Tax (PIT) based on the proposed tax reform bill."
                icon={Landmark}
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
                        <PopoverContent className="w-auto p-0" align="start">
                            <FullCalendar
                                plugins={[dayGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                selectable={true}
                                headerToolbar={{
                                    left: 'prev',
                                    center: 'title',
                                    right: 'next'
                                }}
                                dateClick={(arg: DateClickArg) => {
                                    setStartDate(arg.date);
                                    if (endDate && arg.date > endDate) {
                                        setEndDate(arg.date);
                                    }
                                }}
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
                        <PopoverContent className="w-auto p-0" align="end">
                            <FullCalendar
                                plugins={[dayGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                selectable={true}
                                validRange={startDate ? { start: startDate } : undefined}
                                headerToolbar={{
                                    left: 'prev',
                                    center: 'title',
                                    right: 'next'
                                }}
                                dateClick={(arg: DateClickArg) => {
                                    setEndDate(arg.date);
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </PageHeader>
            
            {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Personal Income Tax (PIT) Summary</CardTitle>
                            <CardDescription>Based on proposed Nigerian PITA rates for enterprise businesses.</CardDescription>
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

                    <Card>
                        <CardHeader>
                            <CardTitle>Tax Breakdown</CardTitle>
                             <CardDescription>Progressive tax rates applied to chargeable income.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Taxable Amount</TableHead>
                                        <TableHead className="text-right">Tax</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {taxCalculations.taxBreakdown.map((bracket, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{bracket.rate}%</TableCell>
                                            <TableCell>{formatCurrency(bracket.amount)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(bracket.tax)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {taxCalculations.taxBreakdown.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center h-24">No chargeable income.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                     <TaxMetricCard 
                        title="Estimated Personal Income Tax (PIT)"
                        value={taxCalculations.personalIncomeTax}
                        description="Total tax from all brackets"
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
