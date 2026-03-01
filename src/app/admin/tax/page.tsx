'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore } from "@/firebase";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { Landmark, Loader2, CalendarIcon, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from '@fullcalendar/interaction';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Transaction = DocumentData & {
    type: 'PlatformEarning';
    amount: number;
    createdAt: Timestamp;
    ownerAllocatable?: boolean;
    ownerAllocationId?: string;
    platformEarningKind?: 'Operating' | 'OwnerDistributionAdjustment' | 'InterAccountAdjustment';
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
        const operatingPlatformEarnings = earningsTransactions?.filter((tx) => {
            if (tx.amount <= 0) return false;
            if (tx.platformEarningKind) return tx.platformEarningKind === 'Operating';
            return tx.ownerAllocatable !== false && !tx.ownerAllocationId;
        }) || [];
        const platformEarnings = operatingPlatformEarnings.reduce((sum, tx) => sum + tx.amount, 0);
        const managementFees = adminTransactions?.filter(tx => tx.type === 'ManagementFee').reduce((sum, tx) => sum + tx.amount, 0) || 0;
        const expenses = adminTransactions?.filter(tx => tx.type === 'Expense').reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

        const totalRevenue = platformEarnings + managementFees;
        const assessableProfit = Math.max(0, totalRevenue - expenses);

        // LLC Tax Rules (Nigeria Finance Act)
        // Turnover Thresholds for CIT:
        // Small (< 25M): 0%
        // Medium (25M - 100M): 20%
        // Large (> 100M): 30%
        // Tertiary Education Tax (EDT): 3% of assessable profit (Small companies exempt)

        let citRate = 0;
        let edtRate = 0;
        let category = "Small Company";

        if (totalRevenue >= 100000000) {
            citRate = 0.30;
            edtRate = 0.03;
            category = "Large Company";
        } else if (totalRevenue >= 25000000) {
            citRate = 0.20;
            edtRate = 0.03;
            category = "Medium Company";
        } else {
            citRate = 0;
            edtRate = 0; // Small companies are typically exempt from EDT
            category = "Small Company";
        }

        const educationTax = assessableProfit * edtRate;
        const chargeableIncome = Math.max(0, assessableProfit - educationTax);
        const companyIncomeTax = chargeableIncome * citRate;
        const totalTaxDue = educationTax + companyIncomeTax;
        const profitAfterTax = assessableProfit - totalTaxDue;

        return {
            totalRevenue,
            expenses,
            assessableProfit,
            educationTax,
            companyIncomeTax,
            chargeableIncome,
            totalTaxDue,
            profitAfterTax,
            citRate,
            edtRate,
            category
        };

    }, [earningsTransactions, adminTransactions]);

    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

    return (
        <div>
            <PageHeader
                title="Corporate Tax (LLC)"
                description="Calculate Companies Income Tax (CIT) and Tertiary Education Tax (EDT)."
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
                                dateClick={(arg: any) => {
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
                                dateClick={(arg: any) => {
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
                <div className="grid gap-6">
                    <div className="grid gap-6 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Turnover (Revenue)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(taxCalculations.totalRevenue)}</div>
                                <Badge variant="secondary" className="mt-2">{taxCalculations.category}</Badge>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Assessable Profit</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(taxCalculations.assessableProfit)}</div>
                                <p className="text-xs text-muted-foreground mt-1">Revenue minus Expenses</p>
                            </CardContent>
                        </Card>
                        <Card className="border-primary bg-primary/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Tax Due</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">{formatCurrency(taxCalculations.totalTaxDue)}</div>
                                <p className="text-xs text-muted-foreground mt-1">CIT + EDT</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Calculation Breakdown</CardTitle>
                                <CardDescription>Detailed tax computation for Limited Liability Companies.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>Total Revenue (Turnover)</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.totalRevenue)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Allowable Expenses</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.expenses)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-medium bg-muted/30">
                                            <TableCell>Assessable Profit</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.assessableProfit)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Tertiary Education Tax (EDT) @ {taxCalculations.edtRate * 100}%</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.educationTax)}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-muted-foreground text-xs italic">
                                            <TableCell>Chargeable Income (Profit after EDT)</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.chargeableIncome)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Company Income Tax (CIT) @ {taxCalculations.citRate * 100}%</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.companyIncomeTax)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-bold border-t-2">
                                            <TableCell>Net Profit After Tax</TableCell>
                                            <TableCell className="text-right text-primary">{formatCurrency(taxCalculations.profitAfterTax)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Company Categorization</AlertTitle>
                                <AlertDescription className="text-xs space-y-2">
                                    <p>Based on current Nigerian tax laws:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>Small Company:</strong> Turnover &lt; ₦25M. CIT Rate: 0%. Exempt from EDT.</li>
                                        <li><strong>Medium Company:</strong> Turnover ₦25M - ₦100M. CIT Rate: 20%. EDT Rate: 3%.</li>
                                        <li><strong>Large Company:</strong> Turnover &gt; ₦100M. CIT Rate: 30%. EDT Rate: 3%.</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Tax Summary</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">CIT (Company Income Tax)</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.companyIncomeTax)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">EDT (Education Tax)</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.educationTax)}</span>
                                    </div>
                                    <div className="pt-2 border-t flex justify-between items-center font-bold">
                                        <span>Total Corporate Tax Due</span>
                                        <span className="text-primary">{formatCurrency(taxCalculations.totalTaxDue)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
