'use client';

import { PageHeader } from "@/components/page-header";
import { Banknote, History, Landmark, Wallet, PlusCircle, ArrowRightLeft, MinusCircle, HandCoins, Library, PiggyBank, Building, Star, DollarSign, Info, FileText, Zap, ListFilter, Users, Briefcase, Settings, PieChart } from "lucide-react";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp, writeBatch, serverTimestamp, doc, addDoc, getDocs, orderBy, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser } from "@/firebase";
import { useMemo, useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isSameDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Investment, Deal, Repayment } from "@/lib/types";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { generateAmortizationSchedule } from "@/lib/amortization";
import { Calendar } from "@/components/ui/calendar";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDoc } from "@/firebase/firestore/use-doc";
import { runOwnerProfitAllocationAction, setOwnershipPartnerActiveAction, upsertOwnershipPartnerAction, upsertOwnerProfitPolicyAction } from "./actions";
import { canWriteAdmin } from "@/lib/access-control";
import { getRequiredIdToken } from '@/firebase/auth-token';

type OwnerAllocationRunResult = Awaited<ReturnType<typeof runOwnerProfitAllocationAction>>;

function getOwnerAllocationRunMessage(result: OwnerAllocationRunResult) {
    if (result.success) {
        const processed = 'processed' in result ? result.processed ?? 0 : 0;
        const skipped = 'skipped' in result ? result.skipped ?? 0 : 0;
        return `Processed ${processed}, skipped ${skipped}.`;
    }

    return 'message' in result && result.message ? result.message : 'Failed to run owner allocation.';
}


type PlatformFundBatch = DocumentData & {
    id: string;
    sourceId: 'platform';
    amount: number;
    remainingAmount: number;
    createdAt: Timestamp;
    details?: string;
};

type GenericTransaction = DocumentData & {
    id: string;
    userId: string;
    type: 'PlatformEarning' | 'Investment' | 'Zakat' | 'Penalty' | 'Deposit';
    amount: number;
    createdAt: Timestamp;
};

type AdministrativeTransaction = DocumentData & {
    id: string;
    type: 'AdminDeposit' | 'Expense' | 'TransferToInvestible' | 'TransferFromInvestible' | 'AssetAcquisition' | 'AssetSale' | 'ManagementFee' | 'LoanFromPlatformEarnings' | 'LoanRepaymentToPlatformEarnings';
    expenseType?: 'GENERAL_EXPENSE' | 'STAFF_PAYOUT';
    amount: number;
    description: string;
    createdAt: Timestamp;
    dealId?: string;
    dealName?: string;
    clientId?: string;
    clientName?: string;
    staffUserId?: string;
    staffName?: string;
    salaryPeriod?: string;
    salaryCycle?: 'Monthly' | 'BiWeekly' | 'Weekly' | 'OneOff';
    payoutReference?: string;
    loanId?: string;
};

type OwnerProfitAllocation = DocumentData & {
    id: string;
    distributableAmount: number;
    retainedAmount: number;
    sourceEarningAmount: number;
    createdAt: Timestamp;
};

const adminTransactionTypes = [
    'AdminDeposit',
    'Expense',
    'TransferToInvestible',
    'TransferFromInvestible',
    'AssetAcquisition',
    'AssetSale',
    'ManagementFee',
    'LoanFromPlatformEarnings',
    'LoanRepaymentToPlatformEarnings'
] as const;

type AdminTransactionTypeFilter = typeof adminTransactionTypes[number];

type Asset = DocumentData & {
    id: string;
    description: string;
    acquisitionCost: number;
    acquisitionDate: Timestamp;
    status: 'Held' | 'Sold';
    salePrice?: number;
    saleDate?: Timestamp;
};

type FundBatch = DocumentData & {
    remainingAmount: number;
}

type InterAccountLoan = DocumentData & {
    id: string;
    fromAccount: 'platformEarnings';
    toAccount: 'administrative';
    principal: number;
    outstanding: number;
    status: 'Active' | 'Repaid';
    reason: string;
    reference?: string;
    createdAt: Timestamp;
    createdBy?: string;
    repaidAt?: Timestamp;
};

type OwnerProfitPolicy = DocumentData & {
    id: string;
    retainedPercent: number;
    distributablePercent: number;
    totalShares: number;
    allocationStartDate?: Timestamp;
    withdrawalCooldown?: 'QUARTERLY';
};

type OwnershipPartner = DocumentData & {
    id: string;
    userId: string;
    displayName: string;
    shareUnits: number;
    active: boolean;
    updatedAt?: Timestamp;
};

const ITEMS_PER_PAGE = 10;

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const parsedDate = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try {
        return format(parsedDate, 'PPP p');
    } catch {
        return 'Invalid Date';
    }
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value);
};

const adminTransactionSchema = z.object({
    amount: z.coerce.number().positive({ message: "Amount must be a positive number." }),
    description: z.string().min(3, { message: "Description is required." }),
    expenseType: z.enum(['GENERAL_EXPENSE', 'STAFF_PAYOUT']).default('GENERAL_EXPENSE'),
    staffUserId: z.string().optional(),
    staffName: z.string().optional(),
    salaryPeriod: z.string().optional(),
    salaryCycle: z.enum(['Monthly', 'BiWeekly', 'Weekly', 'OneOff']).optional(),
    payoutReference: z.string().optional(),
});

type StaffUser = DocumentData & {
    id: string;
    name?: string;
    email?: string;
    role?: string;
    accessRole?: string;
    personas?: string[];
};

function AdminTransactionForm({ type, onTransactionComplete }: { type: "AdminDeposit" | "Expense" | "AssetAcquisition" | "StaffPayout", onTransactionComplete: () => void }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();
    const usersQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);
    const { data: users } = useCollection<StaffUser>(usersQuery);
    const staffUsers = useMemo(() => {
        return (users || []).filter((u) => u.accessRole === 'STAFF' || (u.personas || []).includes('STAFF_MEMBER'));
    }, [users]);

    const form = useForm<z.infer<typeof adminTransactionSchema>>({
        resolver: zodResolver(adminTransactionSchema),
        defaultValues: {
            amount: 1000,
            description: "",
            expenseType: type === 'StaffPayout' ? 'STAFF_PAYOUT' : 'GENERAL_EXPENSE',
            salaryCycle: 'Monthly',
        },
    });

    async function onSubmit(values: z.infer<typeof adminTransactionSchema>) {
        setIsLoading(true);
        if (!firestore) return;

        try {
            const batch = writeBatch(firestore);
            const now = serverTimestamp();

            if (type === 'AssetAcquisition') {
                const assetRef = doc(collection(firestore, 'assets'));
                batch.set(assetRef, {
                    description: values.description,
                    acquisitionCost: values.amount,
                    acquisitionDate: now,
                    status: 'Held'
                });

                const adminTxRef = doc(collection(firestore, 'administrativeTransactions'));
                batch.set(adminTxRef, {
                    type,
                    expenseType: 'GENERAL_EXPENSE',
                    amount: -Math.abs(values.amount),
                    description: `Acquired asset: ${values.description}`,
                    createdAt: now
                });
            } else {
                const isStaffPayout = type === 'StaffPayout' || values.expenseType === 'STAFF_PAYOUT';
                if (isStaffPayout && (!values.staffUserId || !values.staffName || !values.salaryPeriod || !values.salaryCycle)) {
                    throw new Error('Staff payout requires staff, salary period and salary cycle.');
                }
                const amount = type === 'AdminDeposit' ? values.amount : -Math.abs(values.amount);
                await addDoc(collection(firestore, 'administrativeTransactions'), {
                    type: type === 'StaffPayout' ? 'Expense' : type,
                    expenseType: isStaffPayout ? 'STAFF_PAYOUT' : 'GENERAL_EXPENSE',
                    amount,
                    description: values.description,
                    createdAt: now,
                    staffUserId: isStaffPayout ? values.staffUserId : null,
                    staffName: isStaffPayout ? values.staffName : null,
                    salaryPeriod: isStaffPayout ? values.salaryPeriod : null,
                    salaryCycle: isStaffPayout ? values.salaryCycle : null,
                    payoutReference: values.payoutReference || null,
                });
            }

            await batch.commit();

            toast({ title: "Success", description: `Transaction recorded: ${values.description}` });
            onTransactionComplete();
        } catch (error) {
            console.error("Admin Transaction Error:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to record transaction." });
        } finally {
            setIsLoading(false);
        }
    }

    const buttonText = {
        AdminDeposit: "Add Funds",
        Expense: "Record Expense",
        AssetAcquisition: "Record Asset Purchase",
        StaffPayout: "Record Staff Payout",
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{type === 'AssetAcquisition' ? 'Acquisition Cost' : 'Amount'}</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{type === 'AssetAcquisition' ? 'Asset Description' : 'Description'}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {(type === 'Expense' || type === 'StaffPayout') && (
                    <FormField
                        control={form.control}
                        name="expenseType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Expense Type</FormLabel>
                                <FormControl>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={type === 'StaffPayout' ? 'STAFF_PAYOUT' : field.value}
                                        onChange={(e) => field.onChange(e.target.value)}
                                        disabled={type === 'StaffPayout'}
                                    >
                                        <option value="GENERAL_EXPENSE">General Expense</option>
                                        <option value="STAFF_PAYOUT">Staff Payout</option>
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                {(type === 'StaffPayout' || form.watch('expenseType') === 'STAFF_PAYOUT') && (
                    <>
                        <FormField
                            control={form.control}
                            name="staffUserId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Staff Member</FormLabel>
                                    <FormControl>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={field.value || ''}
                                            onChange={(e) => {
                                                const selectedId = e.target.value;
                                                const selectedUser = staffUsers.find((u) => u.id === selectedId);
                                                field.onChange(selectedId);
                                                form.setValue('staffName', selectedUser?.name || selectedUser?.email || '');
                                            }}
                                        >
                                            <option value="">Select staff</option>
                                            {staffUsers.map((staff) => (
                                                <option key={staff.id} value={staff.id}>
                                                    {staff.name || staff.email || staff.id}
                                                </option>
                                            ))}
                                        </select>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="salaryPeriod"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Salary Period</FormLabel>
                                    <FormControl><Input placeholder="e.g. 2026-02" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="salaryCycle"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Salary Cycle</FormLabel>
                                    <FormControl>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={field.value || 'Monthly'}
                                            onChange={(e) => field.onChange(e.target.value)}
                                        >
                                            <option value="Monthly">Monthly</option>
                                            <option value="BiWeekly">Bi-weekly</option>
                                            <option value="Weekly">Weekly</option>
                                            <option value="OneOff">One-off</option>
                                        </select>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="payoutReference"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Payout Reference (Optional)</FormLabel>
                                    <FormControl><Input placeholder="Bank transfer reference" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {buttonText[type]}
                </Button>
            </form>
        </Form>
    );
}

const recognizeAssetSchema = z.object({
    description: z.string().min(3, { message: "Description is required." }),
    acquisitionCost: z.coerce.number().min(0, "Cost must be a positive number or zero."),
    acquisitionDate: z.date().optional(),
});

function RecognizeAssetForm({ onAssetRecognized }: { onAssetRecognized: () => void }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();

    const form = useForm<z.infer<typeof recognizeAssetSchema>>({
        resolver: zodResolver(recognizeAssetSchema),
        defaultValues: { description: "", acquisitionCost: 0 },
    });

    async function onSubmit(values: z.infer<typeof recognizeAssetSchema>) {
        setIsLoading(true);
        if (!firestore) return;
        try {
            await addDoc(collection(firestore, 'assets'), {
                ...values,
                status: 'Held',
                acquisitionDate: values.acquisitionDate ? Timestamp.fromDate(values.acquisitionDate) : serverTimestamp(),
            });
            toast({ title: 'Asset Recognized', description: `${values.description} has been added to assets.` });
            onAssetRecognized();
        } catch (error) {
            console.error("Asset Recognition Error:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to recognize asset." });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Asset Description</FormLabel>
                            <FormControl><Input placeholder="e.g., Office building" {...field} /></FormControl>
                            <FormDescription>Describe the asset you are logging.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="acquisitionCost"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Original Cost (if known)</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormDescription>Enter 0 if the cost is unknown or not applicable. This will not affect the administrative balance.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="acquisitionDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Acquisition Date (Optional)</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full pl-3 text-left font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value ? (
                                                format(field.value, "PPP")
                                            ) : (
                                                <span>Pick a date</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={(date) => form.setValue('acquisitionDate', date)}
                                        disabled={(date) => date > new Date()}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormDescription>
                                The date the asset was acquired. Defaults to today if left blank.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Recognize Asset
                </Button>
            </form>
        </Form>
    );
}

const sellAssetSchema = z.object({
    salePrice: z.coerce.number().min(0, "Sale price cannot be negative."),
});

function SellAssetForm({ asset, onAssetSold }: { asset: Asset, onAssetSold: () => void }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();

    const form = useForm<z.infer<typeof sellAssetSchema>>({
        resolver: zodResolver(sellAssetSchema),
        defaultValues: { salePrice: asset.acquisitionCost },
    });

    async function onSubmit(values: z.infer<typeof sellAssetSchema>) {
        setIsLoading(true);
        if (!firestore) return;
        try {
            const batch = writeBatch(firestore);
            const now = serverTimestamp();

            // 1. Update the asset's status
            const assetRef = doc(firestore, 'assets', asset.id);
            batch.update(assetRef, {
                status: 'Sold',
                salePrice: values.salePrice,
                saleDate: now,
            });

            // 2. Create a positive administrative transaction for the sale
            const adminTxRef = doc(collection(firestore, 'administrativeTransactions'));
            batch.set(adminTxRef, {
                type: 'AssetSale',
                amount: values.salePrice,
                description: `Sale of asset: ${asset.description}`,
                createdAt: now,
            });

            await batch.commit();

            toast({ title: "Asset Sold", description: `${asset.description} has been marked as sold.` });
            onAssetSold();
        } catch (error) {
            console.error("Asset Sale Error:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to record asset sale." });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="salePrice"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Sale Price</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Sale
                </Button>
            </form>
        </Form>
    );
}


const transferSchema = z.object({
    amount: z.coerce.number().positive(),
});

function TransferFundsForm({
    direction,
    maxAmount,
    onTransferComplete,
}: {
    direction: "toInvestible" | "fromInvestible";
    maxAmount: number;
    onTransferComplete: () => void;
}) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const firestore = useFirestore();

    const dynamicSchema = transferSchema.extend({
        amount: z.coerce.number().positive().max(maxAmount, { message: "Amount exceeds available balance." }),
    });

    const form = useForm<z.infer<typeof dynamicSchema>>({
        resolver: zodResolver(dynamicSchema),
        defaultValues: { amount: Math.min(1000, maxAmount) },
    });

    async function onSubmit(values: z.infer<typeof dynamicSchema>) {
        setIsLoading(true);
        if (!firestore) return;

        const { amount } = values;

        try {
            const batch = writeBatch(firestore);
            const now = serverTimestamp();

            if (direction === 'toInvestible') {
                // Move from Admin to Investible
                // 1. Debit Admin Account
                const adminTxRef = doc(collection(firestore, "administrativeTransactions"));
                batch.set(adminTxRef, {
                    type: 'TransferToInvestible',
                    amount: -amount,
                    description: `Transfer to Investible Capital`,
                    createdAt: now,
                });
                // 2. Create a new platform fund batch
                const fundBatchRef = doc(collection(firestore, "fundBatches"));
                batch.set(fundBatchRef, {
                    sourceId: 'platform',
                    amount: amount,
                    remainingAmount: amount,
                    tenureValue: 10,
                    tenureUnit: 'Years',
                    createdAt: now,
                });
            } else {
                // Move from Investible to Admin
                let amountToWithdraw = amount;
                const fundBatchesQuery = query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform'), where('remainingAmount', '>', 0), orderBy('createdAt'));
                const batchesSnapshot = await getDocs(fundBatchesQuery);

                for (const batchDoc of batchesSnapshot.docs) {
                    if (amountToWithdraw <= 0) break;
                    const batchData = batchDoc.data();
                    const amountToDeduct = Math.min(amountToWithdraw, batchData.remainingAmount);

                    batch.update(batchDoc.ref, { remainingAmount: batchData.remainingAmount - amountToDeduct });
                    amountToWithdraw -= amountToDeduct;
                }

                if (amountToWithdraw > 0) {
                    throw new Error("Insufficient funds in batches to complete transfer.");
                }

                // 2. Credit Admin Account
                const adminTxRef = doc(collection(firestore, "administrativeTransactions"));
                batch.set(adminTxRef, {
                    type: 'TransferFromInvestible',
                    amount: amount,
                    description: `Transfer from Investible Capital`,
                    createdAt: now,
                });
            }

            await batch.commit();
            toast({ title: "Success", description: `Transfer of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)} completed.` });
            onTransferComplete();
        } catch (error) {
            console.error("Transfer Error:", error);
            toast({ variant: "destructive", title: "Transfer Failed", description: error instanceof Error ? error.message : "An unknown error occurred." });
        } finally {
            setIsLoading(false);
        }
    }

    const title = direction === 'toInvestible' ? "Fund Investible Account" : "Withdraw to Admin Account";
    const description = direction === 'toInvestible' ? "Move funds from Admin Account to make them available for deal funding." : "Move funds from Investible Capital to the Admin Account for operational use.";

    return (
        <>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Amount to Transfer</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormDescription>Max available: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(maxAmount)}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading || maxAmount <= 0}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Transfer Funds
                    </Button>
                </form>
            </Form>
        </>
    );
}

const borrowSchema = z.object({
    amount: z.coerce.number().positive(),
    reason: z.string().min(3, "Reason is required."),
    reference: z.string().optional(),
    loanDate: z.string().optional(),
});

function BorrowFromEarningsForm({
    maxBorrowAmount,
    onComplete,
}: {
    maxBorrowAmount: number;
    onComplete: () => void;
}) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isLoading, setIsLoading] = useState(false);

    const schema = borrowSchema.extend({
        amount: z.coerce.number().positive().max(maxBorrowAmount, { message: "Amount exceeds platform earnings balance." }),
    });

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { amount: Math.min(1000, maxBorrowAmount), reason: '', reference: '', loanDate: '' },
    });

    async function onSubmit(values: z.infer<typeof schema>) {
        setIsLoading(true);
        if (!firestore) return;
        try {
            const createdAtValue = values.loanDate
                ? Timestamp.fromDate(new Date(`${values.loanDate}T00:00:00`))
                : serverTimestamp();
            const batch = writeBatch(firestore);

            const loanRef = doc(collection(firestore, 'interAccountLoans'));
            batch.set(loanRef, {
                fromAccount: 'platformEarnings',
                toAccount: 'administrative',
                principal: values.amount,
                outstanding: values.amount,
                status: 'Active',
                reason: values.reason,
                reference: values.reference || null,
                createdAt: createdAtValue,
                createdBy: 'admin',
            });

            const loanDateLabel = values.loanDate ? format(new Date(`${values.loanDate}T00:00:00`), 'PPP') : 'today';
            const adminTxRef = doc(collection(firestore, 'administrativeTransactions'));
            batch.set(adminTxRef, {
                type: 'LoanFromPlatformEarnings',
                amount: values.amount,
                description: `Loan from platform earnings (${loanDateLabel}): ${values.reason}`,
                createdAt: createdAtValue,
                loanId: loanRef.id,
                reference: values.reference || null,
            });

            const earningsTxRef = doc(collection(firestore, 'transactions'));
            batch.set(earningsTxRef, {
                userId: 'platform',
                type: 'PlatformEarning',
                amount: -Math.abs(values.amount),
                createdAt: createdAtValue,
                details: `Loan to administrative account (${loanRef.id})`,
                ownerAllocatable: false,
                platformEarningKind: 'InterAccountAdjustment',
            });

            await batch.commit();
            toast({ title: "Loan recorded", description: "Administrative account has borrowed from platform earnings." });
            onComplete();
        } catch (error: any) {
            console.error("Borrow error:", error);
            toast({ variant: "destructive", title: "Borrow failed", description: error?.message || "Could not record loan." });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Borrow from Platform Earnings</DialogTitle>
                <DialogDescription>
                    Move funds into Administrative Account and create a tracked liability.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Amount</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormDescription>Max available: {formatCurrency(maxBorrowAmount)}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="reason"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reason</FormLabel>
                                <FormControl><Input placeholder="Operational expense bridge" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="reference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reference (Optional)</FormLabel>
                                <FormControl><Input placeholder="REF-2026-03-001" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="loanDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Loan Date (Optional)</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormDescription>Set this for historical loans that happened before app adoption.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading || maxBorrowAmount <= 0}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Borrow
                    </Button>
                </form>
            </Form>
        </>
    );
}

const repayLoanSchema = z.object({
    loanId: z.string().min(1, "Select a loan."),
    amount: z.coerce.number().positive(),
    reference: z.string().optional(),
});

function RepayPlatformLoanForm({
    maxAdminBalance,
    loans,
    onComplete,
}: {
    maxAdminBalance: number;
    loans: InterAccountLoan[];
    onComplete: () => void;
}) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<z.infer<typeof repayLoanSchema>>({
        resolver: zodResolver(repayLoanSchema),
        defaultValues: { loanId: loans[0]?.id || '', amount: Math.min(1000, maxAdminBalance), reference: '' },
    });

    const selectedLoanId = form.watch('loanId');
    const selectedLoan = useMemo(() => loans.find((loan) => loan.id === selectedLoanId), [loans, selectedLoanId]);
    const maxRepayable = Math.max(0, Math.min(maxAdminBalance, selectedLoan?.outstanding || 0));

    async function onSubmit(values: z.infer<typeof repayLoanSchema>) {
        setIsLoading(true);
        if (!firestore) return;
        try {
            const loan = loans.find((item) => item.id === values.loanId);
            if (!loan) throw new Error("Loan not found.");
            if (values.amount > maxAdminBalance) throw new Error("Repayment exceeds administrative balance.");
            if (values.amount > loan.outstanding) throw new Error("Repayment exceeds selected loan outstanding.");

            const now = serverTimestamp();
            const batch = writeBatch(firestore);
            const nextOutstanding = loan.outstanding - values.amount;

            const loanRef = doc(firestore, 'interAccountLoans', loan.id);
            batch.update(loanRef, {
                outstanding: nextOutstanding,
                status: nextOutstanding <= 0 ? 'Repaid' : 'Active',
                repaidAt: nextOutstanding <= 0 ? now : null,
                updatedAt: now,
            });

            const loanDateLabel = format(loan.createdAt.toDate(), 'PPP');
            const adminTxRef = doc(collection(firestore, 'administrativeTransactions'));
            batch.set(adminTxRef, {
                type: 'LoanRepaymentToPlatformEarnings',
                amount: -Math.abs(values.amount),
                description: `Repayment for loan taken on ${loanDateLabel}`,
                createdAt: now,
                loanId: loan.id,
                reference: values.reference || null,
            });

            const earningsTxRef = doc(collection(firestore, 'transactions'));
            batch.set(earningsTxRef, {
                userId: 'platform',
                type: 'PlatformEarning',
                amount: Math.abs(values.amount),
                createdAt: now,
                details: `Loan repayment from administrative account (${loan.id})`,
                ownerAllocatable: false,
                platformEarningKind: 'InterAccountAdjustment',
            });

            await batch.commit();
            toast({ title: "Repayment recorded", description: "Loan repayment to platform earnings was successful." });
            onComplete();
        } catch (error: any) {
            console.error("Repayment error:", error);
            toast({ variant: "destructive", title: "Repayment failed", description: error?.message || "Could not record repayment." });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Repay Platform Earnings Loan</DialogTitle>
                <DialogDescription>
                    Repay an active administrative liability back to platform earnings.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <FormField
                        control={form.control}
                        name="loanId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Active Loan</FormLabel>
                                <FormControl>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={field.value}
                                        onChange={field.onChange}
                                    >
                                        <option value="">Select loan</option>
                                        {loans.map((loan) => (
                                            <option key={loan.id} value={loan.id}>
                                                {loan.id.slice(0, 8)}... | Outstanding {formatCurrency(loan.outstanding)}
                                            </option>
                                        ))}
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Repayment Amount</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormDescription>
                                    Max repayable now: {formatCurrency(maxRepayable)}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="reference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reference (Optional)</FormLabel>
                                <FormControl><Input placeholder="REP-2026-03-001" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading || maxRepayable <= 0}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Repay Loan
                    </Button>
                </form>
            </Form>
        </>
    );
}

const ownerPolicySchema = z.object({
    retainedPercent: z.coerce.number().min(0).max(100),
    distributablePercent: z.coerce.number().min(0).max(100),
    totalShares: z.coerce.number().int().positive(),
    allocationStartDate: z.string().optional(),
});

function OwnerProfitPolicyForm({
    actorId,
    policy,
    onComplete,
}: {
    actorId?: string;
    policy?: OwnerProfitPolicy | null;
    onComplete: () => void;
}) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const form = useForm<z.infer<typeof ownerPolicySchema>>({
        resolver: zodResolver(ownerPolicySchema),
        defaultValues: {
            retainedPercent: Number(policy?.retainedPercent ?? 50),
            distributablePercent: Number(policy?.distributablePercent ?? 50),
            totalShares: Number(policy?.totalShares ?? 20000000),
            allocationStartDate: policy?.allocationStartDate ? format(policy.allocationStartDate.toDate(), 'yyyy-MM-dd') : '',
        },
    });

    useEffect(() => {
        form.reset({
            retainedPercent: Number(policy?.retainedPercent ?? 50),
            distributablePercent: Number(policy?.distributablePercent ?? 50),
            totalShares: Number(policy?.totalShares ?? 20000000),
            allocationStartDate: policy?.allocationStartDate ? format(policy.allocationStartDate.toDate(), 'yyyy-MM-dd') : '',
        });
    }, [policy, form]);

    const onSubmit = (values: z.infer<typeof ownerPolicySchema>) => {
        if (!actorId) return;
        startTransition(async () => {
            const result = await upsertOwnerProfitPolicyAction({ authToken: await getRequiredIdToken(), ...values, actorId });
            toast({
                variant: result.success ? 'default' : 'destructive',
                title: result.success ? 'Saved' : 'Save failed',
                description: result.message,
            });
            if (result.success) onComplete();
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="retainedPercent" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Retained %</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="distributablePercent" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Distributable %</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="totalShares" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Total Shares</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="allocationStartDate" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Allocation Start Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormDescription>Automatic allocations run only for earnings on/after this date.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Policy
                </Button>
            </form>
        </Form>
    );
}

const ownerPartnerSchema = z.object({
    userId: z.string().min(1),
    displayName: z.string().min(1),
    shareUnits: z.coerce.number().int().positive(),
    active: z.boolean().default(true),
});

function OwnershipPartnerForm({
    actorId,
    users,
    onComplete,
}: {
    actorId?: string;
    users: Array<{ id: string; name?: string; email?: string }>;
    onComplete: () => void;
}) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const hasOwnerAccounts = users.length > 0;
    const form = useForm<z.infer<typeof ownerPartnerSchema>>({
        resolver: zodResolver(ownerPartnerSchema),
        defaultValues: {
            userId: '',
            displayName: '',
            shareUnits: 1000000,
            active: true,
        },
    });

    const onSubmit = (values: z.infer<typeof ownerPartnerSchema>) => {
        if (!actorId) return;
        startTransition(async () => {
            const result = await upsertOwnershipPartnerAction({ authToken: await getRequiredIdToken(), ...values, actorId });
            toast({
                variant: result.success ? 'default' : 'destructive',
                title: result.success ? 'Saved' : 'Save failed',
                description: result.message,
            });
            if (result.success) {
                form.reset({ userId: '', displayName: '', shareUnits: 1000000, active: true });
                onComplete();
            }
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="userId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Owner Account</FormLabel>
                        <FormControl>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field.value}
                                disabled={!hasOwnerAccounts}
                                onChange={(e) => {
                                    const userId = e.target.value;
                                    const selectedUser = users.find((u) => u.id === userId);
                                    field.onChange(userId);
                                    form.setValue('displayName', selectedUser?.name || selectedUser?.email || userId);
                                }}
                            >
                                <option value="">
                                    {hasOwnerAccounts ? 'Select owner user' : 'No owner account selected yet'}
                                </option>
                                {users.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                                ))}
                            </select>
                        </FormControl>
                        {!hasOwnerAccounts && (
                            <FormDescription>
                                No owner account selected yet. Assign at least one user with `accessRole = OWNER` first.
                            </FormDescription>
                        )}
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="shareUnits" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Share Units</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isPending || !hasOwnerAccounts}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Partner
                </Button>
            </form>
        </Form>
    );
}

const allocationRunSchema = z.object({
    includeHistorical: z.boolean().default(false),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    limit: z.coerce.number().int().positive().max(1000).default(500),
});

function OwnerAllocationRunForm({ onComplete }: { onComplete: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const form = useForm<z.infer<typeof allocationRunSchema>>({
        resolver: zodResolver(allocationRunSchema),
        defaultValues: { includeHistorical: true, fromDate: '', toDate: '', limit: 500 },
    });

    const onSubmit = (values: z.infer<typeof allocationRunSchema>) => {
        startTransition(async () => {
            const result = await runOwnerProfitAllocationAction({ authToken: await getRequiredIdToken(), ...values });
            if (!result.success) {
                console.error("Owner allocation backfill failed:", result);
            }
            toast({
                variant: result.success ? 'default' : 'destructive',
                title: result.success ? 'Backfill run complete' : 'Backfill run failed',
                description: result.success
                    ? `Processed ${(result as any).processed ?? 0}, skipped ${(result as any).skipped ?? 0}, errors ${(result as any).errors ?? 0}.`
                    : (result as any).message || 'Could not run backfill.',
            });
            if (result.success) onComplete();
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="fromDate" render={({ field }) => (
                    <FormItem>
                        <FormLabel>From Date (Optional)</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="toDate" render={({ field }) => (
                    <FormItem>
                        <FormLabel>To Date (Optional)</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="limit" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Max Transactions Per Run</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Run Historical Allocation
                </Button>
            </form>
        </Form>
    );
}

export default function PlatformFundsPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const canManageFunds = canWriteAdmin(user);
    const [isDialogOpen, setDialogOpen] = useState<{ [key: string]: boolean }>({});
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTx, setSelectedTx] = useState<AdministrativeTransaction | null>(null);
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<AdminTransactionTypeFilter[]>([]);
    const [isAllocating, startAllocating] = useTransition();


    const openDialog = (key: string) => setDialogOpen(prev => ({ ...prev, [key]: true }));
    const closeDialog = (key: string) => setDialogOpen(prev => ({ ...prev, [key]: false }));

    const platformFundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform')) : null, [firestore]);
    const adminTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'administrativeTransactions'), orderBy('createdAt', 'desc')) : null, [firestore]);
    const zakatTransactionsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions'), where('type', 'in', ['Zakat', 'Penalty'])) : null, [firestore]);
    const allFundBatchesQuery = useMemo(() => firestore ? query(collection(firestore, 'fundBatches')) : null, [firestore]);
    const assetsQuery = useMemo(() => firestore ? query(collection(firestore, 'assets'), orderBy('acquisitionDate', 'desc')) : null, [firestore]);
    const dealsQuery = useMemo(() => firestore ? query(collection(firestore, 'deals')) : null, [firestore]);
    const repaymentsQuery = useMemo(() => firestore ? query(collection(firestore, 'repayments'), where('status', '==', 'Approved')) : null, [firestore]);
    const earningsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions'), where('type', '==', 'PlatformEarning')) : null, [firestore]);
    const allInvestorDepositsQuery = useMemo(() => firestore ? query(collection(firestore, 'transactions'), where('type', '==', 'Deposit')) : null, [firestore]);
    const interAccountLoansQuery = useMemo(() => firestore ? query(collection(firestore, 'interAccountLoans'), orderBy('createdAt', 'desc')) : null, [firestore]);
    const ownershipPartnersQuery = useMemo(() => firestore ? query(collection(firestore, 'ownershipPartners'), orderBy('shareUnits', 'desc')) : null, [firestore]);
    const ownerPolicyRef = useMemo(() => firestore ? doc(firestore, 'platformPolicies', 'ownerProfit') : null, [firestore]);
    const usersQuery = useMemo(() => firestore ? query(collection(firestore, 'users')) : null, [firestore]);
    const ownerAllocationsQuery = useMemo(() => firestore ? query(collection(firestore, 'ownerProfitAllocations')) : null, [firestore]);


    const { data: platformFundBatches, loading: platformBatchesLoading } = useCollection<PlatformFundBatch>(platformFundBatchesQuery);
    const { data: adminTransactions, loading: adminTransactionsLoading } = useCollection<AdministrativeTransaction>(adminTransactionsQuery);
    const { data: zakatTransactions, loading: zakatLoading } = useCollection<GenericTransaction>(zakatTransactionsQuery);
    const { data: allFundBatches, loading: allFundBatchesLoading } = useCollection<FundBatch>(allFundBatchesQuery);
    const { data: assets, loading: assetsLoading } = useCollection<Asset>(assetsQuery);
    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: repayments, loading: repaymentsLoading } = useCollection<Repayment>(repaymentsQuery);
    const { data: earningsTransactions, loading: earningsLoading } = useCollection<GenericTransaction>(earningsQuery);
    const { data: allInvestorDeposits, loading: depositsLoading } = useCollection<GenericTransaction>(allInvestorDepositsQuery);
    const { data: interAccountLoans, loading: loansLoading, error: loansError } = useCollection<InterAccountLoan>(interAccountLoansQuery);
    const { data: ownershipPartners, loading: partnersLoading, error: partnersError } = useCollection<OwnershipPartner>(ownershipPartnersQuery);
    const { data: ownerPolicy } = useDoc<OwnerProfitPolicy>(ownerPolicyRef);
    const { data: allUsers, error: usersError } = useCollection<DocumentData>(usersQuery);
    const { data: ownerAllocations, loading: allocationsLoading } = useCollection<OwnerProfitAllocation>(ownerAllocationsQuery);


    const isLoading = platformBatchesLoading || adminTransactionsLoading || zakatLoading || allFundBatchesLoading || assetsLoading || dealsLoading || repaymentsLoading || earningsLoading || depositsLoading || allocationsLoading;

    const metrics = useMemo(() => {
        const administrativeBalance = adminTransactions?.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0) || 0;

        const platformEarnings = earningsTransactions?.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0) || 0;

        const investibleCapital = platformFundBatches?.reduce((sum, batch) => sum + (Number(batch.remainingAmount) || 0), 0) || 0;
        const zakatPool = zakatTransactions?.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0) || 0;
        const totalInvestiblePool = allFundBatches?.reduce((sum, batch) => sum + (Number(batch.remainingAmount) || 0), 0) || 0;
        const totalAssetValue = assets?.filter(a => a.status === 'Held').reduce((sum, asset) => sum + (Number(asset.acquisitionCost) || 0), 0) || 0;

        let totalClientDebt = 0;
        let totalInvested = 0;
        if (deals && repayments) {
            const activeDeals = deals.filter(d => d.status === 'Active');
            for (const deal of activeDeals) {
                const schedule = generateAmortizationSchedule(deal);
                const approvedRepaymentsForDeal = repayments.filter(r => r.dealId === deal.id);
                const paidInstallmentNumbers = approvedRepaymentsForDeal.map(r => r.installmentNumber);

                const remainingInstallments = schedule.filter(inst => !paidInstallmentNumbers.includes(inst.installment));

                totalClientDebt += remainingInstallments.reduce((sum, inst) => sum + inst.payment, 0);
                totalInvested += remainingInstallments.reduce((sum, inst) => sum + inst.principal, 0);
            }
        }


        const cumulativeInvestments = allInvestorDeposits?.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0) || 0;
        const cumulativeDeals = deals?.reduce((sum, deal) => sum + (Number(deal.principal) || 0), 0) || 0;
        const adminDebtToPlatformFromLedger = interAccountLoans
            ?.filter((loan) => loan.status === 'Active')
            .reduce((sum, loan) => sum + (Number(loan.outstanding) || 0), 0) || 0;
        const adminDebtToPlatformFromTransactions = adminTransactions
            ?.filter((tx) => tx.type === 'LoanFromPlatformEarnings' || tx.type === 'LoanRepaymentToPlatformEarnings')
            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0) || 0;
        const adminDebtToPlatform = adminDebtToPlatformFromLedger > 0
            ? adminDebtToPlatformFromLedger
            : Math.max(0, adminDebtToPlatformFromTransactions);
        const activeLoanCount = interAccountLoans?.filter((loan) => loan.status === 'Active').length || 0;

        const totalOwnerAllocated = ownerAllocations?.reduce((sum, alloc) => sum + (Number(alloc.distributableAmount) || 0), 0) || 0;


        return {
            investibleCapital,
            administrativeBalance,
            zakatPool,
            totalInvested,
            totalInvestiblePool,
            totalAssetValue,
            totalClientDebt,
            platformEarnings,
            cumulativeInvestments,
            cumulativeDeals,
            adminDebtToPlatformFromLedger,
            adminDebtToPlatformFromTransactions,
            adminDebtToPlatform,
            activeLoanCount,
            totalOwnerAllocated,
        };
    }, [platformFundBatches, adminTransactions, zakatTransactions, allFundBatches, assets, deals, repayments, earningsTransactions, allInvestorDeposits, interAccountLoans, ownerAllocations]);

    const activeInterAccountLoans = useMemo(() => {
        return (interAccountLoans || []).filter((loan) => loan.status === 'Active' && loan.outstanding > 0);
    }, [interAccountLoans]);

    const ownerSelectableUsers = useMemo(() => {
        return (allUsers || [])
            .filter((u) => u.accessRole === 'OWNER')
            .map((u) => ({
                id: u.id as string,
                name: u.name as string | undefined,
                email: u.email as string | undefined,
            }));
    }, [allUsers]);

    const safeAdminDebtToPlatform = Number.isFinite(metrics.adminDebtToPlatform) ? metrics.adminDebtToPlatform : 0;

    const filteredAdminTransactions = useMemo(() => {
        if (!adminTransactions) return [];
        let filtered = adminTransactions;

        if (selectedTypes.length > 0) {
            filtered = filtered.filter(tx => selectedTypes.includes(tx.type as AdminTransactionTypeFilter));
        }

        if (startDate) {
            const startTime = startDate.getTime();
            filtered = filtered.filter(tx => tx.createdAt.toDate().getTime() >= startTime);
        }
        if (endDate) {
            const endTime = new Date(endDate).setHours(23, 59, 59, 999);
            filtered = filtered.filter(tx => tx.createdAt.toDate().getTime() <= endTime);
        }
        return filtered;
    }, [adminTransactions, selectedTypes, startDate, endDate]);

    const paginatedAdminTransactions = useMemo(() => {
        if (!filteredAdminTransactions) return [];
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAdminTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAdminTransactions, currentPage]);

    const totalPages = useMemo(() => filteredAdminTransactions ? Math.ceil(filteredAdminTransactions.length / ITEMS_PER_PAGE) : 0, [filteredAdminTransactions]);

    const handleFilterChange = (type: AdminTransactionTypeFilter) => {
        setSelectedTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
        setCurrentPage(1);
    };

    const handleRowClick = (tx: AdministrativeTransaction) => {
        setSelectedTx(tx);
    };

    const formatDateDisplay = (dateValue: Date | null) => {
        return dateValue ? format(dateValue, "LLL dd, y") : <span>Pick a date</span>;
    }


    return (
        <div>
            <PageHeader
                title="Platform Funds"
                description="An overview of the platform's internal funds, earnings, and investments."
                icon={Banknote}
            />

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Owner Profit Allocation</CardTitle>
                    <CardDescription>
                        Automatic split of platform earnings into retained earnings and owner reinvestible capital.
                    </CardDescription>
                    {canManageFunds ? (
                        <div className="flex flex-wrap gap-2 pt-2">
                            <Dialog open={isDialogOpen['ownerPolicy']} onOpenChange={(isOpen) => isOpen ? openDialog('ownerPolicy') : closeDialog('ownerPolicy')}>
                                <DialogTrigger asChild><Button size="sm" variant="outline"><Settings className="mr-2 h-4 w-4" />Policy</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Owner Profit Policy</DialogTitle></DialogHeader>
                                    <OwnerProfitPolicyForm actorId={user?.uid} policy={ownerPolicy || null} onComplete={() => closeDialog('ownerPolicy')} />
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isDialogOpen['ownerPartner']} onOpenChange={(isOpen) => isOpen ? openDialog('ownerPartner') : closeDialog('ownerPartner')}>
                                <DialogTrigger asChild><Button size="sm" variant="outline"><Users className="mr-2 h-4 w-4" />Add/Update Partner</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Ownership Partner</DialogTitle></DialogHeader>
                                    <OwnershipPartnerForm actorId={user?.uid} users={ownerSelectableUsers} onComplete={() => closeDialog('ownerPartner')} />
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isDialogOpen['ownerBackfill']} onOpenChange={(isOpen) => isOpen ? openDialog('ownerBackfill') : closeDialog('ownerBackfill')}>
                                <DialogTrigger asChild><Button size="sm" variant="outline"><History className="mr-2 h-4 w-4" />Backfill Historical</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Owner Allocation Backfill</DialogTitle></DialogHeader>
                                    <OwnerAllocationRunForm onComplete={() => closeDialog('ownerBackfill')} />
                                </DialogContent>
                            </Dialog>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={isAllocating}
                                onClick={() => {
                                    startAllocating(async () => {
                                        const result = await runOwnerProfitAllocationAction({ authToken: await getRequiredIdToken(), includeHistorical: false, limit: 500 });
                                        if (!result.success) {
                                            console.error("Owner profit allocation run failed:", result);
                                        }
                                        toast({
                                            variant: result.success ? 'default' : 'destructive',
                                            title: result.success ? 'Owner allocation run complete' : 'Owner allocation run failed',
                                            description: getOwnerAllocationRunMessage(result),
                                        });
                                    });
                                }}
                            >
                                {isAllocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Run Allocation
                            </Button>
                        </div>
                    ) : (
                        <p className="pt-2 text-sm text-muted-foreground">
                            Owner access is read-only. Allocation policy and partner changes require an admin account.
                        </p>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Retained %</p>
                            <p className="text-lg font-semibold">{ownerPolicy?.retainedPercent ?? 50}%</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Distributable %</p>
                            <p className="text-lg font-semibold">{ownerPolicy?.distributablePercent ?? 50}%</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Allocation Start Date</p>
                            <p className="text-lg font-semibold">{ownerPolicy?.allocationStartDate ? format(ownerPolicy.allocationStartDate.toDate(), 'PPP') : 'Not set'}</p>
                        </div>
                    </div>
                    
                    {isMobile ? (
                        <div className="space-y-3">
                            {partnersLoading ? (
                                <Skeleton className="h-24 w-full" />
                            ) : partnersError ? (
                                <p className="text-center text-destructive py-4">Could not load partners.</p>
                            ) : (ownershipPartners?.length || 0) === 0 ? (
                                <p className="text-center text-muted-foreground py-4">No ownership partners configured.</p>
                            ) : (
                                ownershipPartners?.map((partner) => (
                                    <Card key={partner.id}>
                                        <CardContent className="p-4 flex justify-between items-center">
                                            <div className="space-y-1">
                                                <p className="font-semibold">{partner.displayName}</p>
                                                <div className="flex gap-2 items-center">
                                                    <Badge variant="outline">{partner.shareUnits.toLocaleString()} units</Badge>
                                                    <Badge variant={partner.active ? 'default' : 'secondary'}>{partner.active ? 'Active' : 'Inactive'}</Badge>
                                                </div>
                                            </div>
                                            {canManageFunds && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        const result = await setOwnershipPartnerActiveAction({
                                                            authToken: await getRequiredIdToken(),
                                                            userId: partner.userId,
                                                            active: !partner.active,
                                                            actorId: user?.uid || '',
                                                        });
                                                        toast({
                                                            variant: result.success ? 'default' : 'destructive',
                                                            title: result.success ? 'Updated' : 'Update failed',
                                                            description: result.message,
                                                        });
                                                    }}
                                                >
                                                    {partner.active ? 'Deactivate' : 'Activate'}
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Partner</TableHead>
                                        <TableHead>Share Units</TableHead>
                                        <TableHead>Status</TableHead>
                                        {canManageFunds && <TableHead className="text-right">Action</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {partnersLoading ? (
                                        <TableRow><TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                                    ) : partnersError ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-16 text-center text-destructive">
                                                Could not load ownership partners (permission or query error).
                                            </TableCell>
                                        </TableRow>
                                    ) : (ownershipPartners?.length || 0) === 0 ? (
                                        <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No ownership partners configured.</TableCell></TableRow>
                                    ) : (
                                        ownershipPartners?.map((partner) => (
                                            <TableRow key={partner.id}>
                                                <TableCell>{partner.displayName}</TableCell>
                                                <TableCell>{partner.shareUnits.toLocaleString()}</TableCell>
                                                <TableCell><Badge variant={partner.active ? 'default' : 'secondary'}>{partner.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                                                {canManageFunds && (
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={async () => {
                                                                const result = await setOwnershipPartnerActiveAction({
                                                                    authToken: await getRequiredIdToken(),
                                                                    userId: partner.userId,
                                                                    active: !partner.active,
                                                                    actorId: user?.uid || '',
                                                                });
                                                                toast({
                                                                    variant: result.success ? 'default' : 'destructive',
                                                                    title: result.success ? 'Updated' : 'Update failed',
                                                                    description: result.message,
                                                                });
                                                            }}
                                                        >
                                                            {partner.active ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {usersError && (
                        <p className="text-xs text-destructive">
                            Could not load users for partner picker. Check Firestore rules/deploy.
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Administrative Account</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.administrativeBalance)}</div>}
                        <p className="text-xs text-muted-foreground">Balance for operational expenses.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Platform Earnings</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.platformEarnings)}</div>}
                        <p className="text-xs text-muted-foreground">Total accumulated earnings.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Invested (Active)</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.totalInvested)}</div>}
                        <p className="text-xs text-muted-foreground">Outstanding principal in active deals.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Investible Pool</CardTitle>
                        <Library className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.totalInvestiblePool)}</div>}
                        <p className="text-xs text-muted-foreground">Total available capital from all sources.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Admin Debt to Platform</CardTitle>
                        <HandCoins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(safeAdminDebtToPlatform)}</div>
                        <p className="text-xs text-muted-foreground">Outstanding liability across {metrics.activeLoanCount} active loan(s).</p>
                        {loansError && (
                            <p className="text-xs text-destructive mt-1">
                                Could not load loan ledger. Showing fallback value.
                            </p>
                        )}
                        {!loansError && metrics.adminDebtToPlatformFromLedger === 0 && metrics.adminDebtToPlatformFromTransactions > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Derived from administrative transactions while ledger catches up.
                            </p>
                        )}
                        {loansLoading && (
                            <p className="text-xs text-muted-foreground mt-1">Loading loan ledger...</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Owner Allocated</CardTitle>
                        <PieChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.totalOwnerAllocated)}</div>}
                        <p className="text-xs text-muted-foreground">Sum of all distributions to owners.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Client Debt</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.totalClientDebt)}</div>}
                        <p className="text-xs text-muted-foreground">Total outstanding principal and profit.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cumulative Investments</CardTitle>
                        <PiggyBank className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.cumulativeInvestments)}</div>}
                        <p className="text-xs text-muted-foreground">Total capital deposited by investors.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cumulative Deals Value</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.cumulativeDeals)}</div>}
                        <p className="text-xs text-muted-foreground">Total principal of all deals created.</p>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={!!selectedTx} onOpenChange={(isOpen) => !isOpen && setSelectedTx(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Transaction Details</DialogTitle>
                    </DialogHeader>
                    {selectedTx && (
                        <div className="space-y-4 pt-4">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Type:</span>
                                <Badge variant={selectedTx.amount > 0 ? 'secondary' : 'outline'}>{selectedTx.type}</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Amount:</span>
                                <span className={`font-medium ${selectedTx.amount > 0 ? 'text-primary' : ''}`}>{formatCurrency(selectedTx.amount)}</span>
                            </div>
                            {selectedTx.type === 'ManagementFee' && selectedTx.clientName && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Client:</span>
                                    <span>{selectedTx.clientName}</span>
                                </div>
                            )}
                            {selectedTx.expenseType === 'STAFF_PAYOUT' && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Staff:</span>
                                        <span>{selectedTx.staffName || selectedTx.staffUserId || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Salary Period:</span>
                                        <span>{selectedTx.salaryPeriod || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Salary Cycle:</span>
                                        <span>{selectedTx.salaryCycle || 'N/A'}</span>
                                    </div>
                                    {selectedTx.payoutReference && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Reference:</span>
                                            <span>{selectedTx.payoutReference}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            {(selectedTx.type === 'LoanFromPlatformEarnings' || selectedTx.type === 'LoanRepaymentToPlatformEarnings') && selectedTx.loanId && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Original Loan Date:</span>
                                    <span>{(() => {
                                        const loan = interAccountLoans?.find(l => l.id === selectedTx.loanId);
                                        return loan ? format(loan.createdAt.toDate(), 'PPP') : 'N/A';
                                    })()}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Date:</span>
                                <span>{formatDate(selectedTx.createdAt)}</span>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Description:</p>
                                <p>{selectedTx.description}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Transaction ID:</p>
                                <p className="text-xs break-all">{selectedTx.id}</p>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Tabs defaultValue="activity" className="mt-8">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="activity">Administrative Activity</TabsTrigger>
                    <TabsTrigger value="assets">Asset Management</TabsTrigger>
                </TabsList>
                <TabsContent value="activity" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Administrative Activity</CardTitle>
                            <CardDescription>Manage operational funds: deposits, expenses, and transfers.</CardDescription>
                            <div className="flex flex-wrap gap-2 pt-2">
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
                                                disabled={(date) => (startDate ? date < startDate : false)}
                                                onSelect={(date) => {
                                                    if (!date) return;
                                                    setEndDate(date);
                                                }}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="shrink-0">
                                            <ListFilter className="mr-2 h-4 w-4" />
                                            Filter by Type
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Transaction Type</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {adminTransactionTypes.map(type => (
                                            <DropdownMenuCheckboxItem
                                                key={type}
                                                checked={selectedTypes.includes(type)}
                                                onCheckedChange={() => handleFilterChange(type)}
                                            >
                                                {type}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <div className="flex-grow" />
                                {canManageFunds && (
                                    <>
                                        <Dialog open={isDialogOpen['deposit']} onOpenChange={(isOpen) => isOpen ? openDialog('deposit') : closeDialog('deposit')}><DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Add Funds</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add Funds to Admin Account</DialogTitle></DialogHeader><AdminTransactionForm type="AdminDeposit" onTransactionComplete={() => closeDialog('deposit')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['expense']} onOpenChange={(isOpen) => isOpen ? openDialog('expense') : closeDialog('expense')}><DialogTrigger asChild><Button size="sm" variant="outline"><MinusCircle className="mr-2 h-4 w-4" />Record Expense</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record an Expense</DialogTitle></DialogHeader><AdminTransactionForm type="Expense" onTransactionComplete={() => closeDialog('expense')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['staffPayout']} onOpenChange={(isOpen) => isOpen ? openDialog('staffPayout') : closeDialog('staffPayout')}><DialogTrigger asChild><Button size="sm" variant="outline"><DollarSign className="mr-2 h-4 w-4" />Record Staff Payout</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record Staff Salary Payout</DialogTitle></DialogHeader><AdminTransactionForm type="StaffPayout" onTransactionComplete={() => closeDialog('staffPayout')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['borrowFromEarnings']} onOpenChange={(isOpen) => isOpen ? openDialog('borrowFromEarnings') : closeDialog('borrowFromEarnings')}><DialogTrigger asChild><Button size="sm" variant="outline"><HandCoins className="mr-2 h-4 w-4" />Borrow from Earnings</Button></DialogTrigger><DialogContent><BorrowFromEarningsForm maxBorrowAmount={Math.max(0, metrics.platformEarnings)} onComplete={() => closeDialog('borrowFromEarnings')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['repayEarningsLoan']} onOpenChange={(isOpen) => isOpen ? openDialog('repayEarningsLoan') : closeDialog('repayEarningsLoan')}><DialogTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Repay Earnings Loan</Button></DialogTrigger><DialogContent><RepayPlatformLoanForm maxAdminBalance={Math.max(0, metrics.administrativeBalance)} loans={activeInterAccountLoans} onComplete={() => closeDialog('repayEarningsLoan')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['transferToInvestible']} onOpenChange={(isOpen) => isOpen ? openDialog('transferToInvestible') : closeDialog('transferToInvestible')}><DialogTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Fund Investible</Button></DialogTrigger><DialogContent><TransferFundsForm direction="toInvestible" maxAmount={metrics.administrativeBalance} onTransferComplete={() => closeDialog('transferToInvestible')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['transferFromInvestible']} onOpenChange={(isOpen) => isOpen ? openDialog('transferFromInvestible') : closeDialog('transferFromInvestible')}><DialogTrigger asChild><Button size="sm" variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4" />Withdraw to Admin</Button></DialogTrigger><DialogContent><TransferFundsForm direction="fromInvestible" maxAmount={metrics.investibleCapital} onTransferComplete={() => closeDialog('transferFromInvestible')} /></DialogContent></Dialog>
                                    </>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
                                !paginatedAdminTransactions || paginatedAdminTransactions.length === 0 ? <div className="p-4 py-12 text-center text-sm text-muted-foreground border-t">No administrative activities found for the selected filters.</div> :
                                    isMobile ? (
                                        <div className="p-4 space-y-3 border-t">
                                            {paginatedAdminTransactions.map(tx => (
                                                <Card key={tx.id} onClick={() => handleRowClick(tx)}>
                                                    <CardContent className="p-4 space-y-2">
                                                        <div className="flex justify-between items-start">
                                                            <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                                            <p className={`font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}</p>
                                                        </div>
                                                        <p className="text-sm truncate">{tx.description}</p>
                                                        <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {paginatedAdminTransactions?.map(tx => (
                                                    <TableRow key={tx.id} onClick={() => handleRowClick(tx)} className="cursor-pointer">
                                                        <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                                        <TableCell><Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge></TableCell>
                                                        <TableCell className="max-w-xs truncate">{tx.description}</TableCell>
                                                        <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : ''}`}>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                        </CardContent>
                        {totalPages > 1 && (<div className="p-4 border-t"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)) }} aria-disabled={currentPage === 1} /></PaginationItem>{[...Array(totalPages)].map((_, i) => (<PaginationItem key={i}><PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1); }} isActive={currentPage === i + 1}>{i + 1}</PaginationLink></PaginationItem>))}<PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)) }} aria-disabled={currentPage === totalPages} /></PaginationItem></PaginationContent></Pagination></div>)}
                    </Card>
                </TabsContent>
                <TabsContent value="assets" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Asset Management</CardTitle>
                            <CardDescription>Record, track, and manage all platform-owned assets.</CardDescription>
                            <div className="flex flex-wrap gap-2 pt-2">
                                {canManageFunds && (
                                    <>
                                        <Dialog open={isDialogOpen['acquireAsset']} onOpenChange={(isOpen) => isOpen ? openDialog('acquireAsset') : closeDialog('acquireAsset')}><DialogTrigger asChild><Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Acquire Asset</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record New Asset Purchase</DialogTitle></DialogHeader><AdminTransactionForm type="AssetAcquisition" onTransactionComplete={() => closeDialog('acquireAsset')} /></DialogContent></Dialog>
                                        <Dialog open={isDialogOpen['recognizeAsset']} onOpenChange={(isOpen) => isOpen ? openDialog('recognizeAsset') : closeDialog('recognizeAsset')}><DialogTrigger asChild><Button size="sm" variant="outline"><Star className="mr-2 h-4 w-4" />Recognize Existing Asset</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Log an Existing Asset</DialogTitle><DialogDescription>Use this to add an asset to the books without creating a new financial transaction.</DialogDescription></DialogHeader><RecognizeAssetForm onAssetRecognized={() => closeDialog('recognizeAsset')} /></DialogContent></Dialog>
                                    </>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <h3 className="text-lg font-semibold mb-2">Currently Held Assets</h3>
                            {isMobile ? (
                                <div className="space-y-3">
                                    {assets?.filter(a => a.status === 'Held').map(asset => (
                                        <Card key={asset.id}>
                                            <CardContent className="p-4 space-y-3">
                                                <p className="font-medium">{asset.description}</p>
                                                <p className="text-sm text-muted-foreground">Cost: {formatCurrency(asset.acquisitionCost)}</p>
                                                <p className="text-xs text-muted-foreground">Acquired: {asset.acquisitionDate ? format(asset.acquisitionDate.toDate(), 'PPP') : 'Pending...'}</p>
                                                <div className="pt-2 border-t">
                                                    {canManageFunds && (
                                                        <Dialog open={isDialogOpen[`sell-mobile-${asset.id}`]} onOpenChange={(isOpen) => isOpen ? openDialog(`sell-mobile-${asset.id}`) : closeDialog(`sell-mobile-${asset.id}`)}>
                                                            <DialogTrigger asChild><Button size="sm" variant="outline" className="w-full"><DollarSign className="mr-2 h-4 w-4" />Sell</Button></DialogTrigger>
                                                            <DialogContent><DialogHeader><DialogTitle>Record Sale of {asset.description}</DialogTitle></DialogHeader><SellAssetForm asset={asset} onAssetSold={() => closeDialog(`sell-mobile-${asset.id}`)} /></DialogContent>
                                                        </Dialog>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {assets?.filter(a => a.status === 'Held').length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No assets are currently held.</p>}
                                </div>
                            ) : (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Acquisition Date</TableHead><TableHead className="text-right">Cost</TableHead>{canManageFunds && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
                                        <TableBody>
                                            {isLoading ? (Array.from({ length: 2 }).map((_, i) => <TableRow key={i}><TableCell><Skeleton className="h-5 w-32" /></TableCell><TableCell><Skeleton className="h-5 w-24" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell></TableRow>))
                                                : (assets?.filter(a => a.status === 'Held').length || 0) > 0 ? assets?.filter(a => a.status === 'Held').map(asset => (
                                                    <TableRow key={asset.id}><TableCell>{asset.description}</TableCell><TableCell>{asset.acquisitionDate ? format(asset.acquisitionDate.toDate(), 'PPP') : 'Pending...'}</TableCell><TableCell className="text-right">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(asset.acquisitionCost)}</TableCell>
                                                        {canManageFunds && (
                                                            <TableCell className="text-right">
                                                                <Dialog open={isDialogOpen[`sell-${asset.id}`]} onOpenChange={(isOpen) => isOpen ? openDialog(`sell-${asset.id}`) : closeDialog(`sell-${asset.id}`)}>
                                                                    <DialogTrigger asChild><Button size="sm" variant="outline"><DollarSign className="mr-2 h-4 w-4" />Sell</Button></DialogTrigger>
                                                                    <DialogContent><DialogHeader><DialogTitle>Record Sale of {asset.description}</DialogTitle></DialogHeader><SellAssetForm asset={asset} onAssetSold={() => closeDialog(`sell-${asset.id}`)} /></DialogContent>
                                                                </Dialog>
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                )) : <TableRow><TableCell colSpan={4} className="h-24 text-center">No assets are currently held.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            <h3 className="text-lg font-semibold mt-6 mb-2">Sold Assets</h3>
                            {isMobile ? (
                                <div className="space-y-3">
                                    {assets?.filter(a => a.status === 'Sold').map(asset => (
                                        <Card key={asset.id}>
                                            <CardContent className="p-4 space-y-2">
                                                <p className="font-medium">{asset.description}</p>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sale Price:</span><span>{formatCurrency(asset.salePrice || 0)}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Original Cost:</span><span>{formatCurrency(asset.acquisitionCost)}</span></div>
                                                <p className="text-xs text-muted-foreground pt-1 border-t mt-2">Sold: {asset.saleDate ? format(asset.saleDate.toDate(), 'PPP') : 'N/A'}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {assets?.filter(a => a.status === 'Sold').length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No assets have been sold.</p>}
                                </div>
                            ) : (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Sale Date</TableHead><TableHead className="text-right">Sale Price</TableHead><TableHead className="text-right">Original Cost</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {isLoading ? (Array.from({ length: 1 }).map((_, i) => <TableRow key={i}><TableCell><Skeleton className="h-5 w-32" /></TableCell><TableCell><Skeleton className="h-5 w-24" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell></TableRow>))
                                                : (assets?.filter(a => a.status === 'Sold').length || 0) > 0 ? assets?.filter(a => a.status === 'Sold').map(asset => (
                                                    <TableRow key={asset.id}><TableCell>{asset.description}</TableCell><TableCell>{asset.saleDate ? format(asset.saleDate.toDate(), 'PPP') : 'N/A'}</TableCell><TableCell className="text-right">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(asset.salePrice || 0)}</TableCell><TableCell className="text-right text-muted-foreground">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(asset.acquisitionCost)}</TableCell></TableRow>
                                                )) : <TableRow><TableCell colSpan={4} className="h-24 text-center">No assets have been sold.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
