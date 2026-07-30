'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore } from "@/firebase";
import { addDoc, collection, query, where, DocumentData, Timestamp, serverTimestamp } from "firebase/firestore";
import { Landmark, Loader2, CalendarIcon, Info, AlertTriangle, Save, Plus, Trash2 } from "lucide-react";
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
import { roundCurrency } from "@/lib/financial-integrity";
import { calculateWithholdingTaxPosition } from "@/lib/tax-calculations";
import {
    calculateCompanyTax2026,
    calculateVat2026,
    calculateWhtDeduction2026,
    NIGERIA_TAX_2026_EFFECTIVE_DATE,
    VAT_RATE,
    WHT_CATEGORY_LABELS,
    type WhtCategory,
    type WhtRecipientType,
    type WhtResidence,
} from "@/lib/nigeria-tax-2026";

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

type Asset = DocumentData & {
    acquisitionCost: number;
    status: 'Held' | 'Sold';
};

type WhtScheduleEntry = {
    id: string;
    beneficiaryName: string;
    beneficiaryAddress: string;
    beneficiaryTaxId: string;
    paymentMonth: string;
    category: WhtCategory;
    recipientType: WhtRecipientType;
    residence: WhtResidence;
    grossAmount: number;
    treatyRate: number | null;
    remittedAmount: number;
};

const createWhtEntry = (): WhtScheduleEntry => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    beneficiaryName: '',
    beneficiaryAddress: '',
    beneficiaryTaxId: '',
    paymentMonth: format(new Date(), 'yyyy-MM'),
    category: 'OTHER_SERVICES',
    recipientType: 'CORPORATE',
    residence: 'RESIDENT',
    grossAmount: 0,
    treatyRate: null,
    remittedAmount: 0,
});

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value);
};

export default function TaxPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [startDate, setStartDate] = useState<Date | null>(() => new Date(2026, 0, 1));
    const [endDate, setEndDate] = useState<Date | null>(() => new Date());
    const [fixedAssetAdjustment, setFixedAssetAdjustment] = useState(0);
    const [isNonResidentCompany, setIsNonResidentCompany] = useState(false);
    const [isQualifyingMneGroupEntity, setIsQualifyingMneGroupEntity] = useState(false);
    const [disallowedExpenses, setDisallowedExpenses] = useState(0);
    const [exemptIncome, setExemptIncome] = useState(0);
    const [lossRelief, setLossRelief] = useState(0);
    const [capitalAllowances, setCapitalAllowances] = useState(0);
    const [etrNetIncomeAdjustment, setEtrNetIncomeAdjustment] = useState(0);
    const [prioritySectorTaxCredit, setPrioritySectorTaxCredit] = useState(0);
    const [whtCredits, setWhtCredits] = useState(0);
    const [whtSchedule, setWhtSchedule] = useState<WhtScheduleEntry[]>([]);
    const [additionalStandardRatedSupplies, setAdditionalStandardRatedSupplies] = useState(0);
    const [eligibleInputVat, setEligibleInputVat] = useState(0);
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

    const assetsQuery = useMemo(
        () => firestore ? query(collection(firestore, 'assets')) : null,
        [firestore]
    );

    const { data: earningsTransactions, loading: earningsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    const { data: assets, loading: assetsLoading } = useCollection<Asset>(assetsQuery);

    const isLoading = earningsLoading || adminTransactionsLoading || assetsLoading;

    const taxCalculations = useMemo(() => {
        const operatingPlatformEarnings = earningsTransactions?.filter((tx) => {
            if (tx.amount <= 0) return false;
            if (tx.platformEarningKind) return tx.platformEarningKind === 'Operating';
            return tx.ownerAllocatable !== false && !tx.ownerAllocationId;
        }) || [];
        const platformEarnings = roundCurrency(operatingPlatformEarnings.reduce((sum, tx) => sum + tx.amount, 0));
        const managementFees = roundCurrency(adminTransactions?.filter(tx => tx.type === 'ManagementFee').reduce((sum, tx) => sum + tx.amount, 0) || 0);
        const expenses = roundCurrency(adminTransactions?.filter(tx => tx.type === 'Expense').reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0);

        const totalRevenue = roundCurrency(platformEarnings + managementFees);
        const profitBeforeTax = Math.max(0, roundCurrency(totalRevenue - expenses));
        const adjustedProfit = Math.max(0, roundCurrency(profitBeforeTax + disallowedExpenses - exemptIncome));
        const assessableProfit = Math.max(0, roundCurrency(adjustedProfit - lossRelief));
        const estimatedTotalProfits = Math.max(0, roundCurrency(assessableProfit - capitalAllowances));
        const recordedFixedAssets = roundCurrency(
            assets?.filter(asset => asset.status === 'Held')
                .reduce((sum, asset) => sum + (Number(asset.acquisitionCost) || 0), 0) || 0
        );
        const fixedAssets = Math.max(0, roundCurrency(recordedFixedAssets + fixedAssetAdjustment));
        const auditedNetIncome = Math.max(0, roundCurrency(profitBeforeTax + etrNetIncomeAdjustment));
        const companyTax = calculateCompanyTax2026({
            turnover: totalRevenue,
            fixedAssets,
            assessableProfit,
            totalProfits: estimatedTotalProfits,
            auditedNetIncome,
            isNonResidentCompany,
            isMneGroupEntity: isQualifyingMneGroupEntity,
            prioritySectorTaxCredit,
        });
        const monthlySupplierTotals = whtSchedule.reduce<Record<string, number>>((totals, entry) => {
            const supplierKey = entry.beneficiaryTaxId.trim().toLowerCase() || entry.beneficiaryName.trim().toLowerCase();
            const key = `${supplierKey}:${entry.paymentMonth}`;
            totals[key] = roundCurrency((totals[key] || 0) + entry.grossAmount);
            return totals;
        }, {});
        const calculatedWhtSchedule = whtSchedule.map(entry => {
            const supplierKey = entry.beneficiaryTaxId.trim().toLowerCase() || entry.beneficiaryName.trim().toLowerCase();
            return ({
            ...entry,
            calculation: calculateWhtDeduction2026({
                category: entry.category,
                recipientType: entry.recipientType,
                residence: entry.residence,
                grossAmount: entry.grossAmount,
                hasTaxId: Boolean(entry.beneficiaryTaxId.trim()),
                payerQualifiesAsSmallCompany: companyTax.qualifiesAsSmallCompany,
                monthlySupplierTransactionValue: monthlySupplierTotals[`${supplierKey}:${entry.paymentMonth}`],
                treatyRate: entry.treatyRate,
            }),
        })});
        const whtDeducted = roundCurrency(calculatedWhtSchedule.reduce((sum, entry) => sum + entry.calculation.amount, 0));
        const whtRemitted = roundCurrency(calculatedWhtSchedule.reduce((sum, entry) => sum + entry.remittedAmount, 0));
        const whtPosition = calculateWithholdingTaxPosition({
            grossCorporateTaxDue: companyTax.grossCorporateTaxDue,
            creditsSuffered: whtCredits,
            deductedFromPayments: whtDeducted,
            remitted: whtRemitted,
        });
        const corporateTaxPayable = whtPosition.corporateTaxPayable;
        const vat = calculateVat2026({
            recordedStandardRatedSupplies: managementFees,
            additionalStandardRatedSupplies,
            eligibleInputVat,
        });
        const totalCurrentTaxPayable = roundCurrency(corporateTaxPayable + vat.vatPayable + whtPosition.outstanding);
        const profitAfterTax = Math.max(0, roundCurrency(estimatedTotalProfits - companyTax.grossCorporateTaxDue));

        return {
            platformEarnings,
            managementFees,
            totalRevenue,
            expenses,
            profitBeforeTax,
            adjustedProfit,
            assessableProfit,
            estimatedTotalProfits,
            recordedFixedAssets,
            fixedAssets,
            auditedNetIncome,
            developmentLevy: companyTax.developmentLevy,
            companyIncomeTax: companyTax.companyIncomeTax,
            coveredTaxesBeforeTopUp: companyTax.coveredTaxesBeforeTopUp,
            totalTaxDue: companyTax.grossCorporateTaxDue,
            whtCreditApplied: whtPosition.creditApplied,
            whtCreditCarryforward: whtPosition.creditCarryforward,
            corporateTaxPayable,
            whtDeducted,
            whtRemitted,
            calculatedWhtSchedule,
            whtOutstanding: whtPosition.outstanding,
            whtRemittanceExcess: whtPosition.remittanceExcess,
            profitAfterTax,
            standardRatedSupplies: vat.standardRatedSupplies,
            outputVat: vat.outputVat,
            inputVat: vat.eligibleInputVat,
            vatPayable: vat.vatPayable,
            vatRecoverable: vat.vatCredit,
            totalCurrentTaxPayable,
            citRate: companyTax.citRate,
            developmentLevyRate: companyTax.developmentLevyRate,
            category: companyTax.category,
            qualifiesAsSmallCompany: companyTax.qualifiesAsSmallCompany,
            minimumEtrApplies: companyTax.minimumEtrApplies,
            minimumEtrBenchmark: companyTax.minimumEtrBenchmark,
            potentialMinimumEtrTopUp: companyTax.minimumEtrTopUp,
        };

    }, [
        earningsTransactions,
        adminTransactions,
        assets,
        fixedAssetAdjustment,
        isNonResidentCompany,
        isQualifyingMneGroupEntity,
        disallowedExpenses,
        exemptIncome,
        lossRelief,
        capitalAllowances,
        etrNetIncomeAdjustment,
        prioritySectorTaxCredit,
        whtCredits,
        whtSchedule,
        additionalStandardRatedSupplies,
        eligibleInputVat,
    ]);

    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }

    const handleNumericInput = (value: string, setter: (value: number) => void) => {
        const parsed = Number(value);
        setter(value === '' || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed));
    };

    const updateWhtEntry = (id: string, changes: Partial<WhtScheduleEntry>) => {
        setWhtSchedule(current => current.map(entry => entry.id === id ? { ...entry, ...changes } : entry));
    };

    const saveTaxRecord = async () => {
        if (!firestore || isSaving) return;
        const incompleteWhtEntry = whtSchedule.find(
            entry => !entry.beneficiaryName.trim() || !entry.beneficiaryAddress.trim() || !entry.paymentMonth || entry.grossAmount <= 0
        );
        if (incompleteWhtEntry) {
            toast({
                variant: 'destructive',
                title: 'Complete the WHT schedule',
                description: 'Each payment needs a beneficiary name, address, payment month, and gross amount.',
            });
            return;
        }

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
                auditedNetIncome: taxCalculations.auditedNetIncome,
                etrNetIncomeAdjustment: roundCurrency(etrNetIncomeAdjustment),
                prioritySectorTaxCredit: roundCurrency(prioritySectorTaxCredit),
                whtCredits: roundCurrency(whtCredits),
                whtCreditApplied: taxCalculations.whtCreditApplied,
                whtCreditCarryforward: taxCalculations.whtCreditCarryforward,
                corporateTaxPayable: taxCalculations.corporateTaxPayable,
                whtDeducted: taxCalculations.whtDeducted,
                whtRemitted: taxCalculations.whtRemitted,
                whtSchedule: taxCalculations.calculatedWhtSchedule,
                whtOutstanding: taxCalculations.whtOutstanding,
                whtRemittanceExcess: taxCalculations.whtRemittanceExcess,
                recordedStandardRatedSupplies: taxCalculations.managementFees,
                additionalStandardRatedSupplies: roundCurrency(additionalStandardRatedSupplies),
                outputVat: taxCalculations.outputVat,
                inputVat: taxCalculations.inputVat,
                vatPayable: taxCalculations.vatPayable,
                vatRecoverable: taxCalculations.vatRecoverable,
                totalCurrentTaxPayable: taxCalculations.totalCurrentTaxPayable,
                profitAfterTax: taxCalculations.profitAfterTax,
                companyProfile: {
                    recordedFixedAssets: taxCalculations.recordedFixedAssets,
                    fixedAssetAdjustment: roundCurrency(fixedAssetAdjustment),
                    fixedAssets: taxCalculations.fixedAssets,
                    isNonResidentCompany,
                    isQualifyingMneGroupEntity,
                    category: taxCalculations.category,
                    qualifiesAsSmallCompany: taxCalculations.qualifiesAsSmallCompany,
                },
                taxRegimeEffectiveDate: Timestamp.fromDate(NIGERIA_TAX_2026_EFFECTIVE_DATE),
                lawBasis: 'Nigeria Tax Act 2025, Nigeria Tax Administration Act 2025, and Deduction of Tax at Source (Withholding) Regulations 2024',
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
                title="Tax Management"
                description="Estimate corporate tax, VAT, and withholding tax obligations."
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
                                disabled={(date) => date < new Date(2026, 0, 1) || date > new Date()}
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
                                disabled={(date) => date < new Date(2026, 0, 1) || date > new Date() || (startDate ? date < startOfDay(startDate) : false)}
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
                            This calculator applies the regime effective 1 January 2026. It estimates corporate tax, VAT, and WHT from platform records and disclosed adjustments; it does not file or remit tax. Final returns still require audited accounts, valid invoices, credit notes, remittance evidence, and professional review.
                        </AlertDescription>
                    </Alert>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Company Tax Profile</CardTitle>
                            <CardDescription>These assumptions affect small-company exemption and levy treatment.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Recorded held assets</Label>
                                <Input value={taxCalculations.recordedFixedAssets} disabled />
                                <p className="text-xs text-muted-foreground">Automatically totalled from held assets.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fixedAssetAdjustment">Asset-value adjustment</Label>
                                <Input
                                    id="fixedAssetAdjustment"
                                    type="number"
                                    step="0.01"
                                    value={fixedAssetAdjustment || ''}
                                    onChange={(event) => setFixedAssetAdjustment(Number(event.target.value) || 0)}
                                />
                                <p className="text-xs text-muted-foreground">Signed audited adjustment; final value: {formatCurrency(taxCalculations.fixedAssets)}.</p>
                            </div>
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
                                    checked={isQualifyingMneGroupEntity}
                                    onCheckedChange={(checked) => setIsQualifyingMneGroupEntity(checked === true)}
                                />
                                <span>
                                    <span className="block font-medium">Qualifying MNE group entity</span>
                                    <span className="text-xs text-muted-foreground">Group turnover is at least £750M or its equivalent, triggering minimum effective tax review.</span>
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
                                <Label htmlFor="etrNetIncomeAdjustment">ETR net-income adjustment</Label>
                                <Input
                                    id="etrNetIncomeAdjustment"
                                    type="number"
                                    step="0.01"
                                    value={etrNetIncomeAdjustment || ''}
                                    onChange={(event) => setEtrNetIncomeAdjustment(Number(event.target.value) || 0)}
                                />
                                <p className="text-xs text-muted-foreground">Signed adjustment to recorded PBT for audited net income (excluding franked investment income and unrealised gains/losses).</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="prioritySectorTaxCredit">Priority-sector tax credit</Label>
                                <Input
                                    id="prioritySectorTaxCredit"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={prioritySectorTaxCredit || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setPrioritySectorTaxCredit)}
                                />
                                <p className="text-xs text-muted-foreground">Included as a covered tax only for the minimum effective tax test.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Value Added Tax (VAT)</CardTitle>
                            <CardDescription>Output VAT is calculated automatically at 7.5% from recorded management fees plus any additional standard-rated supplies.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-2">
                                <Label>Recorded management-fee supplies</Label>
                                <Input value={taxCalculations.managementFees} disabled />
                                <p className="text-xs text-muted-foreground">Automatically sourced from management-fee transactions.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="additionalStandardRatedSupplies">Additional standard-rated supplies</Label>
                                <Input
                                    id="additionalStandardRatedSupplies"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={additionalStandardRatedSupplies || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setAdditionalStandardRatedSupplies)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Calculated output VAT</Label>
                                <Input value={taxCalculations.outputVat} disabled />
                                <p className="text-xs text-muted-foreground">{VAT_RATE * 100}% of standard-rated supplies.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="eligibleInputVat">Eligible input VAT</Label>
                                <Input
                                    id="eligibleInputVat"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={eligibleInputVat || ''}
                                    onChange={(event) => handleNumericInput(event.target.value, setEligibleInputVat)}
                                />
                                <p className="text-xs text-muted-foreground">Enter only invoice-supported VAT attributable to taxable supplies.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Withholding Tax (WHT)</CardTitle>
                            <CardDescription>
                                Track WHT suffered as a company tax credit separately from WHT deducted from beneficiary payments and owed to the relevant tax authority.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="whtCredits">WHT suffered / credit notes</Label>
                                    <Input
                                        id="whtCredits"
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        value={whtCredits || ''}
                                        onChange={(event) => handleNumericInput(event.target.value, setWhtCredits)}
                                    />
                                    <p className="text-xs text-muted-foreground">Tax withheld from income received by the company and available as a CIT credit.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Calculated WHT deducted</Label>
                                    <Input value={taxCalculations.whtDeducted} disabled />
                                    <p className="text-xs text-muted-foreground">Automatically totalled from the beneficiary schedule.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Recorded WHT remitted</Label>
                                    <Input value={taxCalculations.whtRemitted} disabled />
                                    <p className="text-xs text-muted-foreground">Automatically totalled from entry-level remittances.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-medium">Beneficiary schedule</h3>
                                        <p className="text-xs text-muted-foreground">Rates and deduction amounts are calculated from each payment&apos;s profile.</p>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => setWhtSchedule(current => [...current, createWhtEntry()])}>
                                        <Plus className="mr-2 h-4 w-4" /> Add payment
                                    </Button>
                                </div>
                                {taxCalculations.calculatedWhtSchedule.length === 0 ? (
                                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                        No beneficiary payments added for this period.
                                    </div>
                                ) : taxCalculations.calculatedWhtSchedule.map((entry, index) => (
                                    <div key={entry.id} className="space-y-4 rounded-md border p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium">Payment {index + 1}</p>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Remove payment ${index + 1}`}
                                                onClick={() => setWhtSchedule(current => current.filter(item => item.id !== entry.id))}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                            <div className="space-y-2">
                                                <Label>Beneficiary name</Label>
                                                <Input value={entry.beneficiaryName} onChange={(event) => updateWhtEntry(entry.id, { beneficiaryName: event.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Beneficiary address</Label>
                                                <Input value={entry.beneficiaryAddress} onChange={(event) => updateWhtEntry(entry.id, { beneficiaryAddress: event.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Tax ID / TIN</Label>
                                                <Input value={entry.beneficiaryTaxId} onChange={(event) => updateWhtEntry(entry.id, { beneficiaryTaxId: event.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Payment month</Label>
                                                <Input type="month" value={entry.paymentMonth} onChange={(event) => updateWhtEntry(entry.id, { paymentMonth: event.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Transaction category</Label>
                                                <select
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={entry.category}
                                                    onChange={(event) => updateWhtEntry(entry.id, { category: event.target.value as WhtCategory })}
                                                >
                                                    {Object.entries(WHT_CATEGORY_LABELS).map(([value, label]) => (
                                                        <option key={value} value={value}>{label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Recipient type</Label>
                                                <select
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={entry.recipientType}
                                                    onChange={(event) => updateWhtEntry(entry.id, { recipientType: event.target.value as WhtRecipientType })}
                                                >
                                                    <option value="CORPORATE">Corporate</option>
                                                    <option value="NON_CORPORATE">Non-corporate</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Residence</Label>
                                                <select
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={entry.residence}
                                                    onChange={(event) => updateWhtEntry(entry.id, { residence: event.target.value as WhtResidence, treatyRate: null })}
                                                >
                                                    <option value="RESIDENT">Resident</option>
                                                    <option value="NON_RESIDENT">Non-resident</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Gross amount</Label>
                                                <Input type="number" min="0" step="0.01" value={entry.grossAmount || ''} onChange={(event) => updateWhtEntry(entry.id, { grossAmount: Math.max(0, Number(event.target.value) || 0) })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Treaty rate (%)</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    disabled={entry.residence !== 'NON_RESIDENT'}
                                                    value={entry.treatyRate ?? ''}
                                                    onChange={(event) => updateWhtEntry(entry.id, { treatyRate: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Calculated rate</Label>
                                                <Input value={`${entry.calculation.effectiveRate}%`} disabled />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Calculated deduction</Label>
                                                <Input value={entry.calculation.amount} disabled />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Amount remitted</Label>
                                                <Input type="number" min="0" step="0.01" value={entry.remittedAmount || ''} onChange={(event) => updateWhtEntry(entry.id, { remittedAmount: Math.max(0, Number(event.target.value) || 0) })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Rule applied</Label>
                                                <p className="min-h-10 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                                    {entry.calculation.reason || `Statutory rate: ${entry.calculation.statutoryRate ?? 'N/A'}%.`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-md border p-3">
                                    <p className="text-xs text-muted-foreground">Credit applied to CIT</p>
                                    <p className="font-semibold">{formatCurrency(taxCalculations.whtCreditApplied)}</p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <p className="text-xs text-muted-foreground">Unused WHT credit</p>
                                    <p className="font-semibold">{formatCurrency(taxCalculations.whtCreditCarryforward)}</p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <p className="text-xs text-muted-foreground">WHT outstanding</p>
                                    <p className={cn("font-semibold", taxCalculations.whtOutstanding > 0 && "text-destructive")}>
                                        {formatCurrency(taxCalculations.whtOutstanding)}
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <p className="text-xs text-muted-foreground">Remittance excess</p>
                                    <p className="font-semibold">{formatCurrency(taxCalculations.whtRemittanceExcess)}</p>
                                </div>
                            </div>

                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Maintain the beneficiary schedule</AlertTitle>
                                <AlertDescription className="text-xs">
                                    WHT rates vary by transaction, recipient type, residence, treaty position, and TIN status. Retain the beneficiary name, identifier, transaction nature, gross amount, rate, deduction, month, authority, and remittance evidence supporting these totals.
                                </AlertDescription>
                            </Alert>
                            <div className="flex justify-end">
                                <Button type="button" onClick={saveTaxRecord} disabled={!firestore || isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Tax Record
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
                        <Card className="border-primary bg-primary/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Current Tax Payable</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">{formatCurrency(taxCalculations.totalCurrentTaxPayable)}</div>
                                <p className="text-xs text-muted-foreground mt-1">Corporate tax + VAT payable + outstanding WHT</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Calculation Breakdown</CardTitle>
                                <CardDescription>Estimated company tax computation using the tax framework effective in 2026.</CardDescription>
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
                                            <TableCell>Less: WHT Credits Applied</TableCell>
                                            <TableCell className="text-right">- {formatCurrency(taxCalculations.whtCreditApplied)}</TableCell>
                                        </TableRow>
                                        {taxCalculations.whtCreditCarryforward > 0 && (
                                            <TableRow>
                                                <TableCell>Unused WHT Credit</TableCell>
                                                <TableCell className="text-right">{formatCurrency(taxCalculations.whtCreditCarryforward)}</TableCell>
                                            </TableRow>
                                        )}
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
                                    <p>Based on the tax framework effective in 2026:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>Small Company:</strong> turnover not above ₦100M and fixed assets not above ₦250M. CIT: 0%. Development Levy: 0%.</li>
                                        <li><strong>Other Companies:</strong> CIT: 30% of taxable total profits.</li>
                                        <li><strong>Development Levy:</strong> 4% of assessable profits, except small companies and non-resident companies.</li>
                                        <li><strong>VAT:</strong> standard-rated supplies are taxed at {VAT_RATE * 100}%; management-fee output VAT and the payable/credit position are calculated automatically.</li>
                                        <li><strong>WHT:</strong> the schedule calculates statutory or treaty rates, the no-TIN rate increase for non-passive income, and the qualifying small-company payment exemption.</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>

                            {taxCalculations.minimumEtrApplies && (
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Minimum Effective Tax Review Required</AlertTitle>
                                    <AlertDescription className="text-xs space-y-2">
                                        <p>This company may be subject to the 15% minimum effective tax rule because it is a qualifying MNE group entity or turnover is at least ₦50B.</p>
                                        <p>Audited net-income basis: <strong>{formatCurrency(taxCalculations.auditedNetIncome)}</strong>. Indicative 15% benchmark: <strong>{formatCurrency(taxCalculations.minimumEtrBenchmark)}</strong>. Estimated top-up after covered taxes: <strong>{formatCurrency(taxCalculations.potentialMinimumEtrTopUp)}</strong>.</p>
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
                                        <span className="text-sm text-muted-foreground">WHT Credit Applied</span>
                                        <span className="font-semibold">- {formatCurrency(taxCalculations.whtCreditApplied)}</span>
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
                                    <div className="pt-2 border-t flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">WHT Deducted</span>
                                        <span className="font-semibold">{formatCurrency(taxCalculations.whtDeducted)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">WHT Remitted</span>
                                        <span className="font-semibold">- {formatCurrency(taxCalculations.whtRemitted)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">WHT Outstanding</span>
                                        <span className={cn("font-semibold", taxCalculations.whtOutstanding > 0 && "text-destructive")}>
                                            {formatCurrency(taxCalculations.whtOutstanding)}
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t flex justify-between items-center font-bold">
                                        <span>Total Current Tax Payable</span>
                                        <span className="text-primary">{formatCurrency(taxCalculations.totalCurrentTaxPayable)}</span>
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
