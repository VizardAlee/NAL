'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore } from "@/firebase";
import { addDoc, collection, query, where, DocumentData, Timestamp, serverTimestamp } from "firebase/firestore";
import { Landmark, Loader2, CalendarIcon, Info, AlertTriangle, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

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

const SMALL_COMPANY_TURNOVER_THRESHOLD = 100_000_000;
const SMALL_COMPANY_FIXED_ASSET_THRESHOLD = 250_000_000;
const STANDARD_COMPANY_CIT_RATE = 0.30;
const DEVELOPMENT_LEVY_RATE = 0.04;
const MINIMUM_ETR_RATE = 0.15;
const MINIMUM_ETR_TURNOVER_THRESHOLD = 50_000_000_000;
const VAT_RATE = 0.075;

export default function TaxPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [fixedAssets, setFixedAssets] = useState<number | null>(null);
    const [isProfessionalService, setIsProfessionalService] = useState(false);
    const [isNonResidentCompany, setIsNonResidentCompany] = useState(false);
    const [isMneGroupEntity, setIsMneGroupEntity] = useState(false);
    const [disallowedExpenses, setDisallowedExpenses] = useState(0);
    const [exemptIncome, setExemptIncome] = useState(0);
    const [lossRelief, setLossRelief] = useState(0);
    const [capitalAllowances, setCapitalAllowances] = useState(0);
    const [whtCredits, setWhtCredits] = useState(0);
    const [outputVat, setOutputVat] = useState(0);
    const [inputVat, setInputVat] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

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
        const profitBeforeTax = Math.max(0, totalRevenue - expenses);
        const adjustedProfit = Math.max(0, profitBeforeTax + disallowedExpenses - exemptIncome);
        const assessableProfit = Math.max(0, adjustedProfit - lossRelief);
        const estimatedTotalProfits = Math.max(0, assessableProfit - capitalAllowances);
        const qualifiesAsSmallCompany =
            totalRevenue <= SMALL_COMPANY_TURNOVER_THRESHOLD &&
            fixedAssets !== null &&
            fixedAssets <= SMALL_COMPANY_FIXED_ASSET_THRESHOLD &&
            !isProfessionalService;

        const citRate = qualifiesAsSmallCompany ? 0 : STANDARD_COMPANY_CIT_RATE;
        const developmentLevyRate = qualifiesAsSmallCompany || isNonResidentCompany ? 0 : DEVELOPMENT_LEVY_RATE;
        const category = qualifiesAsSmallCompany ? "Small Company" : "Standard Company";

        const companyIncomeTax = estimatedTotalProfits * citRate;
        const developmentLevy = assessableProfit * developmentLevyRate;

        const minimumEtrApplies = isMneGroupEntity || totalRevenue >= MINIMUM_ETR_TURNOVER_THRESHOLD;
        const coveredTaxesBeforeTopUp = companyIncomeTax + developmentLevy;
        const minimumEtrBenchmark = minimumEtrApplies ? estimatedTotalProfits * MINIMUM_ETR_RATE : 0;
        const potentialMinimumEtrTopUp = minimumEtrApplies ? Math.max(0, minimumEtrBenchmark - coveredTaxesBeforeTopUp) : 0;
        const totalTaxDue = coveredTaxesBeforeTopUp + potentialMinimumEtrTopUp;
        const corporateTaxPayable = Math.max(0, totalTaxDue - whtCredits);
        const vatPayable = Math.max(0, outputVat - inputVat);
        const vatRecoverable = Math.max(0, inputVat - outputVat);
        const profitAfterTax = Math.max(0, estimatedTotalProfits - totalTaxDue);

        return {
            totalRevenue,
            expenses,
            profitBeforeTax,
            adjustedProfit,
            assessableProfit,
            estimatedTotalProfits,
            developmentLevy,
            companyIncomeTax,
            coveredTaxesBeforeTopUp,
            totalTaxDue,
            corporateTaxPayable,
            profitAfterTax,
            vatPayable,
            vatRecoverable,
            citRate,
            developmentLevyRate,
            category,
            qualifiesAsSmallCompany,
            minimumEtrApplies,
            minimumEtrBenchmark,
            potentialMinimumEtrTopUp
        };

    }, [
        earningsTransactions,
        adminTransactions,
        fixedAssets,
        isProfessionalService,
        isNonResidentCompany,
        isMneGroupEntity,
        disallowedExpenses,
        exemptIncome,
        lossRelief,
        capitalAllowances,
        whtCredits,
        outputVat,
        inputVat,
    ]);

    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

    const handleNumericInput = (value: string, setter: (value: number) => void) => {
        setter(value === '' ? 0 : Math.max(0, Number(value) || 0));
    };

    const saveTaxRecord = async () => {
        if (!firestore || isSaving) return;

        setIsSaving(true);
        try {
            const taxRecord: Record<string, unknown> = {
                totalRevenue: taxCalculations.totalRevenue,
                expenses: taxCalculations.expenses,
                profitBeforeTax: taxCalculations.profitBeforeTax,
                disallowedExpenses,
                exemptIncome,
                lossRelief,
                capitalAllowances,
                adjustedProfit: taxCalculations.adjustedProfit,
                assessableProfit: taxCalculations.assessableProfit,
                totalProfits: taxCalculations.estimatedTotalProfits,
                developmentLevy: taxCalculations.developmentLevy,
                companyIncomeTax: taxCalculations.companyIncomeTax,
                minimumEtrTopUp: taxCalculations.potentialMinimumEtrTopUp,
                grossCorporateTaxDue: taxCalculations.totalTaxDue,
                whtCredits,
                corporateTaxPayable: taxCalculations.corporateTaxPayable,
                outputVat,
                inputVat,
                vatPayable: taxCalculations.vatPayable,
                vatRecoverable: taxCalculations.vatRecoverable,
                profitAfterTax: taxCalculations.profitAfterTax,
                companyProfile: {
                    fixedAssets,
                    isProfessionalService,
                    isNonResidentCompany,
                    isMneGroupEntity,
                    category: taxCalculations.category,
                    qualifiesAsSmallCompany: taxCalculations.qualifiesAsSmallCompany,
                },
                lawBasis: '2026 Nigerian Tax Act',
                createdAt: serverTimestamp(),
            };

            if (startDate) taxRecord.periodStart = Timestamp.fromDate(startOfDay(startDate));
            if (endDate) taxRecord.periodEnd = Timestamp.fromDate(endOfDay(endDate));

            await addDoc(collection(firestore, 'taxRecords'), taxRecord);
            toast({ title: 'Tax record saved', description: 'The calculation has been saved to the audit log.' });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Save failed',
                description: error?.message || 'Could not save this tax record.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Corporate Tax"
                description="Estimate Nigerian Companies Income Tax and Development Levy under the 2026 Nigerian Tax Act."
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

            {isLoading ? (
                <div className="flex justify-center items-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-6">
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Compliance estimate only</AlertTitle>
                        <AlertDescription className="text-xs">
                            This screen estimates corporate tax under the 2026 Nigerian Tax Act from platform records and manual tax adjustments. Final filings still need audited accounts, supporting schedules, exemptions, and professional tax review.
                        </AlertDescription>
                    </Alert>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Company Tax Profile</CardTitle>
                            <CardDescription>These assumptions affect small-company exemption and levy treatment.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="fixedAssets">Fixed assets</Label>
                                <Input
                                    id="fixedAssets"
                                    type="number"
                                    min="0"
                                    placeholder="Enter current fixed assets"
                                    value={fixedAssets ?? ''}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setFixedAssets(value === '' ? null : Math.max(0, Number(value) || 0));
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">Required before the app treats the company as small.</p>
                            </div>
                            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                                <Checkbox
                                    checked={isProfessionalService}
                                    onCheckedChange={(checked) => setIsProfessionalService(checked === true)}
                                />
                                <span>
                                    <span className="block font-medium">Professional service business</span>
                                    <span className="text-xs text-muted-foreground">Professional services do not qualify as small companies.</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                                <Checkbox
                                    checked={isNonResidentCompany}
                                    onCheckedChange={(checked) => setIsNonResidentCompany(checked === true)}
                                />
                                <span>
                                    <span className="block font-medium">Non-resident company</span>
                                    <span className="text-xs text-muted-foreground">Development Levy does not apply to non-resident companies.</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                                <Checkbox
                                    checked={isMneGroupEntity}
                                    onCheckedChange={(checked) => setIsMneGroupEntity(checked === true)}
                                />
                                <span>
                                    <span className="block font-medium">MNE group entity</span>
                                    <span className="text-xs text-muted-foreground">May trigger minimum effective tax review.</span>
                                </span>
                            </label>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Tax Adjustments</CardTitle>
                            <CardDescription>Use audited-account adjustments before relying on this estimate.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="disallowedExpenses">Disallowed expenses</Label>
                                <Input
                                    id="disallowedExpenses"
                                    type="number"
                                    min="0"
                                    value={disallowedExpenses || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setDisallowedExpenses)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exemptIncome">Exempt income</Label>
                                <Input
                                    id="exemptIncome"
                                    type="number"
                                    min="0"
                                    value={exemptIncome || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setExemptIncome)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lossRelief">Loss relief</Label>
                                <Input
                                    id="lossRelief"
                                    type="number"
                                    min="0"
                                    value={lossRelief || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setLossRelief)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="capitalAllowances">Capital allowances</Label>
                                <Input
                                    id="capitalAllowances"
                                    type="number"
                                    min="0"
                                    value={capitalAllowances || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setCapitalAllowances)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="whtCredits">WHT credits</Label>
                                <Input
                                    id="whtCredits"
                                    type="number"
                                    min="0"
                                    value={whtCredits || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setWhtCredits)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="outputVat">Output VAT</Label>
                                <Input
                                    id="outputVat"
                                    type="number"
                                    min="0"
                                    value={outputVat || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setOutputVat)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="inputVat">Input VAT</Label>
                                <Input
                                    id="inputVat"
                                    type="number"
                                    min="0"
                                    value={inputVat || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setInputVat)}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button type="button" className="w-full" onClick={saveTaxRecord} disabled={!firestore || isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Tax Record
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

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
                                <CardTitle className="text-sm font-medium">Taxable Total Profits</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(taxCalculations.estimatedTotalProfits)}</div>
                                <p className="text-xs text-muted-foreground mt-1">After tax adjustments and capital allowances</p>
                            </CardContent>
                        </Card>
                        <Card className="border-primary bg-primary/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Corporate Tax Payable</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">{formatCurrency(taxCalculations.corporateTaxPayable)}</div>
                                <p className="text-xs text-muted-foreground mt-1">CIT + Development Levy + ETR top-up, less WHT credits</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Calculation Breakdown</CardTitle>
                                <CardDescription>Estimated company tax computation using current 2026 Nigerian Tax Act rates.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>Total Revenue (Turnover)</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.totalRevenue)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Recorded Expenses</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.expenses)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Profit Before Tax</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.profitBeforeTax)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Add Back: Disallowed Expenses</TableCell>
                                            <TableCell className="text-right">{formatCurrency(disallowedExpenses)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Less: Exempt Income</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(exemptIncome)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Adjusted Profit</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.adjustedProfit)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Less: Loss Relief</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(lossRelief)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-medium bg-muted/30">
                                            <TableCell>Assessable Profit</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.assessableProfit)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Less: Capital Allowances</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(capitalAllowances)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-medium bg-muted/30">
                                            <TableCell>Taxable Total Profits</TableCell>
                                            <TableCell className="text-right">{formatCurrency(taxCalculations.estimatedTotalProfits)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Companies Income Tax (CIT) @ {taxCalculations.citRate * 100}%</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.companyIncomeTax)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Development Levy @ {taxCalculations.developmentLevyRate * 100}%</TableCell>
                                            <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.developmentLevy)}</TableCell>
                                        </TableRow>
                                        {taxCalculations.potentialMinimumEtrTopUp > 0 && (
                                            <TableRow>
                                                <TableCell>Minimum ETR Top-up</TableCell>
                                                <TableCell className="text-right text-destructive">- {formatCurrency(taxCalculations.potentialMinimumEtrTopUp)}</TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow>
                                            <TableCell>Less: WHT Credits</TableCell>
                                            <TableCell className="text-right">- {formatCurrency(whtCredits)}</TableCell>
                                        </TableRow>
                                        <TableRow className="font-bold border-t-2">
                                            <TableCell>Corporate Tax Payable</TableCell>
                                            <TableCell className="text-right text-primary">{formatCurrency(taxCalculations.corporateTaxPayable)}</TableCell>
                                        </TableRow>
                                        <TableRow>
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
                                    <p>Based on the 2026 Nigerian Tax Act:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>Small Company:</strong> turnover not above ₦100M, fixed assets not above ₦250M, and not a professional service business. CIT: 0%. Development Levy: 0%.</li>
                                        <li><strong>Other Companies:</strong> CIT: 30% of taxable total profits.</li>
                                        <li><strong>Development Levy:</strong> 4% of assessable profits, except small companies and non-resident companies.</li>
                                        <li><strong>VAT:</strong> taxable supplies remain subject to VAT at {VAT_RATE * 100}%. Enter output and input VAT from invoice records to track payable or recoverable VAT.</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>

                            {taxCalculations.minimumEtrApplies && (
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Minimum Effective Tax Review Required</AlertTitle>
                                    <AlertDescription className="text-xs space-y-2">
                                        <p>This company may be subject to the 15% minimum effective tax rule because it is marked as an MNE group entity or turnover is at least ₦50B.</p>
                                        <p>Indicative 15% benchmark: <strong>{formatCurrency(taxCalculations.minimumEtrBenchmark)}</strong>. Estimated top-up after CIT and Development Levy: <strong>{formatCurrency(taxCalculations.potentialMinimumEtrTopUp)}</strong>.</p>
                                    </AlertDescription>
                                </Alert>
                            )}

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
                                        <span className="text-sm text-muted-foreground">Development Levy</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.developmentLevy)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Minimum ETR Top-up</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.potentialMinimumEtrTopUp)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">WHT Credits</span>
                                        <span className="font-semibold">- {formatCurrency(whtCredits)}</span>
                                    </div>
                                    <div className="pt-2 border-t flex justify-between items-center font-bold">
                                        <span>Estimated Corporate Tax Payable</span>
                                        <span className="text-primary">{formatCurrency(taxCalculations.corporateTaxPayable)}</span>
                                    </div>
                                    <div className="pt-2 border-t flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">VAT Payable</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.vatPayable)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">VAT Recoverable</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.vatRecoverable)}</span>
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
