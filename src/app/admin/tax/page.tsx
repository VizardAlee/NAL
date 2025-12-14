

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";


type Transaction = DocumentData & {
  type: 'PlatformEarning';
  amount: number;
  createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
  type: 'ManagementFee' | 'Expense';
  amount: number;
  createdAt: Timestamp;
  description: string;
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
    const isMobile = useIsMobile();

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'transactions'), where('type', '==', 'PlatformEarning'));
        if (startDate) q = query(q, where('createdAt', '>=', startOfDay(startDate)));
        if (endDate) q = query(q, where('createdAt', '<=', endOfDay(endDate)));
        return q;
    }, [firestore, startDate, endDate]);

    const adminTransactionsQuery = useMemo(() => {
        if (!firestore) return null;
        let q = query(collection(firestore, 'administrativeTransactions'));
        if (startDate) q = query(q, where('createdAt', '>=', startOfDay(startDate)));
        if (endDate) q = query(q, where('createdAt', '<=', endOfDay(endDate)));
        return q;
    }, [firestore, startDate, endDate]);

    const { data: earningsTransactions, loading: earningsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    
    const isLoading = earningsLoading || adminTransactionsLoading;
    
    const taxCalculations = useMemo(() => {
        const platformEarnings = earningsTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        const managementFees = adminTransactions?.filter(tx => tx.type === 'ManagementFee').reduce((sum, tx) => sum + tx.amount, 0) || 0;
        
        const rentTransaction = adminTransactions
            ?.find(tx => tx.type === 'Expense' && tx.description.toLowerCase().includes('rent'));
        
        const annualRent = rentTransaction ? Math.abs(rentTransaction.amount) : 0;

        const grossProfit = platformEarnings + managementFees;
        const rentRelief = Math.min(annualRent * 0.20, 500000);
        const chargeableIncome = Math.max(0, grossProfit - rentRelief);

        let totalTax = 0;
        let incomeToTax = chargeableIncome;
        const breakdown = [];

        const brackets = [
            { description: "First ₦800,000", limit: 800000, rate: 0.00 },
            { description: "Next ₦2,000,000", limit: 2000000, rate: 0.10 },
            { description: "Next ₦5,000,000", limit: 5000000, rate: 0.15 },
            { description: "Next ₦10,000,000", limit: 10000000, rate: 0.20 },
            { description: "Above ₦17,800,000", limit: Infinity, rate: 0.25 },
        ];

        for (const bracket of brackets) {
            if (incomeToTax <= 0) break;
            
            const taxableInBracket = Math.min(incomeToTax, bracket.limit);
            const taxForBracket = taxableInBracket * bracket.rate;
            totalTax += taxForBracket;
            
            if (taxableInBracket > 0) {
                 breakdown.push({
                    description: `${bracket.description} @ ${bracket.rate * 100}%`,
                    taxableAmount: taxableInBracket,
                    taxDue: taxForBracket,
                });
            }
           
            incomeToTax -= taxableInBracket;
        }

        const profitAfterTax = grossProfit - totalTax;

        return {
            grossProfit,
            annualRent,
            rentRelief,
            chargeableIncome,
            personalIncomeTax: totalTax,
            profitAfterTax,
            taxBreakdown: breakdown,
        };

    }, [earningsTransactions, adminTransactions]);
    
    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

    return (
        <div>
            <PageHeader
                title="Tax Calculation (Enterprise)"
                description="Estimate Personal Income Tax (PIT) based on the proposed 2025 tax reform bill."
                icon={Landmark}
            >
                 <div className="flex flex-col sm:flex-row gap-2">
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
                    <span className="text-muted-foreground hidden sm:inline">-</span>
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
                            <CardDescription>Based on proposed 2025 Nigerian PITA rates for enterprise businesses.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="max-w-xs space-y-2 mb-6">
                                <Label>Annual Rent Paid</Label>
                                <Input 
                                    type="text"
                                    value={formatCurrency(taxCalculations.annualRent)}
                                    readOnly
                                    className="font-medium"
                                />
                                <p className="text-xs text-muted-foreground">This value is automatically calculated from the first administrative expense with "rent" in the description for the selected period.</p>
                            </div>
                            {isMobile ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Profit:</span> <span>{formatCurrency(taxCalculations.grossProfit)}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rent Relief:</span> <span className="text-destructive">- {formatCurrency(taxCalculations.rentRelief)}</span></div>
                                    <div className="flex justify-between font-bold text-base pt-2 border-t mt-2"><span >Chargeable Income:</span> <span>{formatCurrency(taxCalculations.chargeableIncome)}</span></div>
                                </div>
                            ) : (
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>Gross Profit</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.grossProfit)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Rent Relief Allowance (20% of rent, capped at ₦500k)</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.rentRelief)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-medium bg-muted/50">
                                            <TableCell>Chargeable Income</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.chargeableIncome)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Tax Breakdown</CardTitle>
                             <CardDescription>Progressive tax rates applied to chargeable income.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             {isMobile ? (
                                <div className="space-y-3">
                                    {taxCalculations.taxBreakdown.map((bracket, index) => (
                                        <Card key={index} className="p-3">
                                            <p className="font-medium text-sm">{bracket.description}</p>
                                            <div className="flex justify-between text-xs mt-1"><span>Taxable:</span><span>{formatCurrency(bracket.taxableAmount)}</span></div>
                                            <div className="flex justify-between text-xs font-bold"><span>Tax Due:</span><span>{formatCurrency(bracket.taxDue)}</span></div>
                                        </Card>
                                    ))}
                                    {taxCalculations.taxBreakdown.length === 0 && (
                                        <p className="text-center text-sm text-muted-foreground py-4">No chargeable income.</p>
                                    )}
                                </div>
                             ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tax Bracket</TableHead>
                                            <TableHead>Taxable Amount</TableHead>
                                            <TableHead className="text-right">Tax Due</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {taxCalculations.taxBreakdown.map((bracket, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{bracket.description}</TableCell>
                                                <TableCell>{formatCurrency(bracket.taxableAmount)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(bracket.taxDue)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {taxCalculations.taxBreakdown.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center h-24">No chargeable income.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                             )}
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
