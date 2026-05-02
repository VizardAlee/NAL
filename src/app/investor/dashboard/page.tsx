
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Landmark, History, FileText, Download, Wallet, RefreshCcw, Loader2, Banknote, ArrowRight, PlusCircle, MessageSquare, Copy, Gavel } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useCollection, useDoc } from '@/firebase';
import { collection, query, where, DocumentData, Timestamp, orderBy, limit, doc } from 'firebase/firestore';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { type User } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays, addDays, startOfWeek, subWeeks } from 'date-fns';
import { Deal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WithdrawForm } from "./withdraw-form";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { reinvestAction, requestCapitalWithdrawalAction } from "./withdrawal-actions";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { DepositForm } from "./deposit-form";
import { getOrCreateConversation, listContactAdmins } from "@/app/common/actions/chat-actions";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { generateAmortizationSchedule } from "@/lib/amortization";


type Transaction = DocumentData & {
    id: string;
    type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution' | 'Zakat';
    amount: number;
    dealId?: string;
    userId: string;
    createdAt: Timestamp;
    dealName?: string; // Denormalized for display
};

type Investment = DocumentData & {
    id: string;
    investorId: string;
    dealId: string;
    amount: number;
    createdAt: Timestamp;
};

type FundBatch = DocumentData & {
    id: string;
    sourceId: string;
    amount: number;
    remainingAmount: number;
    createdAt: Timestamp;
    tenureValue: number;
    tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    details?: string;
    specialInvestment?: boolean;
};

type InvestorRequest = DocumentData & {
    id: string;
    amount: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt: Timestamp;
};

type UserProfile = DocumentData & {
    id: string;
    lastWithdrawalDate?: Timestamp;
    name: string;
    role: 'Admin' | 'Client' | 'Investor';
    legalDocumentUrl?: string;
};


const DURATION_IN_DAYS = {
    Days: 1,
    Weeks: 7,
    Fortnights: 14,
    Months: 30.4375,
    Years: 365.25,
};

function convertToDays(value: number, unit: keyof typeof DURATION_IN_DAYS): number {
    return value * (DURATION_IN_DAYS[unit] || 0);
}

const TWELVE_MONTHS_IN_DAYS = 12 * 30.4375;


const chartConfig = {
    portfolioValue: { label: "Portfolio Value", color: "hsl(var(--primary))" },
};

function ReinvestButton({ balance, user }: { balance: number, user: User }) {
    const auth = useAuth();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleReinvest = () => {
        const currentUser = auth?.currentUser;
        if (!currentUser) return;
        startTransition(async () => {
            const authToken = await currentUser.getIdToken();
            const result = await reinvestAction({
                authToken,
                amount: balance,
                userId: user.uid,
                userName: user.displayName || 'Unknown',
            });
            if (result.success) {
                toast({
                    title: "Reinvestment Request Sent",
                    description: result.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Reinvestment Failed",
                    description: result.message,
                });
            }
        });
    };

    return (
        <Button
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={handleReinvest}
            disabled={balance <= 0 || isPending}
        >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Reinvest Balance
        </Button>
    );
}

function BankDetailsCard() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const bankDetailsRef = useMemo(() => firestore ? doc(firestore, 'platformSettings', 'bankDetails') : null, [firestore]);
    const { data: bankDetails, loading } = useDoc(bankDetailsRef);

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied!', description: `${field} copied to clipboard.` });
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                    <CardDescription>For making deposits and manual repayments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-6 w-2/3" />
                </CardContent>
            </Card>
        );
    }

    if (!bankDetails) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Landmark /> Bank Details</CardTitle>
                <CardDescription>For making deposits and manual repayments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Bank Name</p>
                        <p className="font-medium">{bankDetails.bankName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Name</p>
                        <p className="font-medium">{bankDetails.accountName}</p>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-muted-foreground">Account Number</p>
                        <p className="font-medium">{bankDetails.accountNumber}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(bankDetails.accountNumber, 'Account Number')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function ContactAdminSheet() {
    const auth = useAuth();
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();
    const [admins, setAdmins] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;

        async function loadAdmins() {
            const currentUser = auth?.currentUser;
            if (!currentUser || !user) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const authToken = await currentUser.getIdToken();
            const result = await listContactAdmins({ authToken });

            if (cancelled) return;
            if (result.success) {
                setAdmins(result.admins);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Unable to load admins',
                    description: result.message,
                });
            }
            setLoading(false);
        }

        loadAdmins();
        return () => {
            cancelled = true;
        };
    }, [auth, toast, user]);

    const handleSelectAdmin = (admin: { id: string; name: string }) => {
        const currentUser = auth?.currentUser;
        if (!user?.displayName || !currentUser) return;
        startTransition(async () => {
            const authToken = await currentUser.getIdToken();
            const result = await getOrCreateConversation({
                authToken,
                adminId: admin.id,
                adminName: admin.name,
                userId: user.uid,
                userName: user.displayName || 'User'
            });

            if (result.success && result.conversationId) {
                router.push(`/investor/messages/${result.conversationId}`);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message || "Could not start conversation.",
                });
            }
        });
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Contact Admin
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Contact an Administrator</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-3">
                    {loading && <p>Loading admins...</p>}
                    {!loading && admins.length === 0 && <p className="text-sm text-muted-foreground">No administrators are available right now.</p>}
                    {admins?.map(admin => (
                        <Button
                            key={admin.id}
                            variant="secondary"
                            className="w-full justify-start h-14"
                            onClick={() => handleSelectAdmin(admin)}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-4 h-4 w-4" />}
                            Chat with {admin.name}
                        </Button>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function UninvestedCapitalCard({ batches, user }: { batches: FundBatch[] | null, user: User }) {
    const auth = useAuth();
    const { toast } = useToast();
    const [pendingWithdrawal, setPendingWithdrawal] = useState<string | null>(null);

    const eligibleBatches = useMemo(() => {
        if (!batches) return [];
        return batches.filter(batch => {
            const isShortTerm = (batch.tenureValue * (DURATION_IN_DAYS[batch.tenureUnit as keyof typeof DURATION_IN_DAYS] || 0)) <= TWELVE_MONTHS_IN_DAYS;
            const isUninvested = batch.amount === batch.remainingAmount;
            const isOverOneMonthOld = differenceInDays(new Date(), batch.createdAt.toDate()) > 30;
            return isShortTerm && isUninvested && isOverOneMonthOld;
        });
    }, [batches]);

    const handleWithdraw = async (batchId: string) => {
        const currentUser = auth?.currentUser;
        if (!currentUser) return;
        setPendingWithdrawal(batchId);
        const authToken = await currentUser.getIdToken();
        const result = await requestCapitalWithdrawalAction({
            authToken,
            batchId,
            userId: user.uid,
            userName: user.displayName || 'User'
        });
        if (result.success) {
            toast({ title: 'Success', description: result.message });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setPendingWithdrawal(null);
    }

    if (!eligibleBatches || eligibleBatches.length === 0) {
        return null;
    }

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Uninvested Short-Term Capital</CardTitle>
                <CardDescription>The following funds have been uninvested for over a month and are eligible for withdrawal.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {eligibleBatches.map(batch => (
                        <div key={batch.id} className="flex items-center justify-between p-3 rounded-md border">
                            <div>
                                <p className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</p>
                                <p className="text-xs text-muted-foreground">Deposited on {format(batch.createdAt.toDate(), 'PPP')}</p>
                                {batch.specialInvestment && <Badge className="mt-1">Special priority</Badge>}
                            </div>
                            <Button size="sm" onClick={() => handleWithdraw(batch.id)} disabled={pendingWithdrawal === batch.id}>
                                {pendingWithdrawal === batch.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                                Request Withdrawal
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function InvestorDashboard() {
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    const [isWithdrawOpen, setWithdrawOpen] = useState(false);
    const [isDepositOpen, setDepositOpen] = useState(false);
    const [chartRange, setChartRange] = useState<'4w' | '12w' | '52w' | 'all'>('12w');
    const isMobile = useIsMobile();

    const userProfileRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);

    // Query for all transactions for chart and metrics
    const allTransactionsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'));
    }, [firestore, user]);

    // Query for recent transactions for the dashboard card
    const recentTransactionsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
    }, [firestore, user]);

    const investmentsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'investments'), where('investorId', '==', user.uid));
    }, [firestore, user]);

    const fundBatchesQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'fundBatches'), where('sourceId', '==', user.uid));
    }, [firestore, user]);

    const firstDepositQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', user.uid), where('type', '==', 'Deposit'), orderBy('createdAt', 'asc'), limit(1));
    }, [firestore, user]);

    const withdrawalRequestsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'withdrawalRequests'), where('investorId', '==', user.uid), orderBy('requestedAt', 'desc'), limit(5));
    }, [firestore, user]);

    const depositRequestsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'depositRequests'), where('investorId', '==', user.uid), orderBy('requestedAt', 'desc'), limit(5));
    }, [firestore, user]);

    const reinvestmentRequestsQuery = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return query(collection(firestore, 'reinvestmentRequests'), where('investorId', '==', user.uid), orderBy('requestedAt', 'desc'), limit(5));
    }, [firestore, user]);


    const { data: userProfile, loading: userProfileLoading } = useDoc<UserProfile>(userProfileRef as any);
    const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);
    const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
    const { data: allTransactions, loading: allTransactionsLoading } = useCollection<Transaction>(allTransactionsQuery);
    const { data: recentTransactions, loading: recentTransactionsLoading } = useCollection<Transaction>(recentTransactionsQuery);
    const { data: firstDeposit, loading: firstDepositLoading } = useCollection<Transaction>(firstDepositQuery);
    const { data: withdrawalRequests, loading: withdrawalRequestsLoading } = useCollection<InvestorRequest>(withdrawalRequestsQuery);
    const { data: depositRequests, loading: depositRequestsLoading } = useCollection<InvestorRequest>(depositRequestsQuery);
    const { data: reinvestmentRequests, loading: reinvestmentRequestsLoading } = useCollection<InvestorRequest>(reinvestmentRequestsQuery);


    const investedDealIds = useMemo(() => {
        if (!investments) return [];
        return [...new Set(investments.map(inv => inv.dealId))];
    }, [investments]);

    const dealsQuery = useMemo(() => {
        if (!firestore || investedDealIds.length === 0) return null;
        return query(collection(firestore, 'deals'), where('__name__', 'in', investedDealIds));
    }, [firestore, investedDealIds]);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);

    const allDealInvestmentsQuery = useMemo(() => {
        if (!firestore || investedDealIds.length === 0) return null;
        return query(collection(firestore, 'investments'), where('dealId', 'in', investedDealIds));
    }, [firestore, investedDealIds]);

    const { data: allDealInvestments, loading: allDealInvestmentsLoading } = useCollection<Investment>(allDealInvestmentsQuery);

    const isLoading = userLoading || allTransactionsLoading || recentTransactionsLoading || investmentsLoading || allDealInvestmentsLoading || dealsLoading || fundBatchesLoading || isMobile === undefined || userProfileLoading || firstDepositLoading || withdrawalRequestsLoading || depositRequestsLoading || reinvestmentRequestsLoading;

    const { longTermProfits, withdrawableBalance, expectedIncome, totalProfitsEarned } = useMemo(() => {
        if (!allTransactions || !deals || !investments || !allDealInvestments) {
            return { longTermProfits: 0, withdrawableBalance: 0, expectedIncome: 0, totalProfitsEarned: 0 };
        }

        const profitTransactions = allTransactions.filter(tx => tx.type === 'ProfitDistribution');
        const totalProfitsEarned = profitTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        let totalLongTermProfit = 0;
        let totalShortTermProfit = 0;
        let totalExpectedIncome = 0;

        for (const profitTx of profitTransactions) {
            const deal = deals.find(d => d.id === profitTx.dealId);
            if (!deal) continue;

            const dealDurationInDays = convertToDays(deal.durationValue, deal.durationUnit);

            if (dealDurationInDays > TWELVE_MONTHS_IN_DAYS) {
                totalLongTermProfit += profitTx.amount;
            } else {
                totalShortTermProfit += profitTx.amount;
            }
        }

        const activeDeals = deals.filter(d => d.status === 'Active');
        for (const deal of activeDeals) {
            const schedule = generateAmortizationSchedule(deal);
            const investmentsForDeal = allDealInvestments.filter(inv => inv.dealId === deal.id);
            const totalInvestedInDeal = investmentsForDeal.reduce((s, i) => s + i.amount, 0);
            const userInvestmentInDeal = investmentsForDeal.filter(inv => inv.investorId === user?.uid).reduce((s, i) => s + i.amount, 0);

            if (totalInvestedInDeal > 0 && userInvestmentInDeal > 0) {
                const userOwnership = userInvestmentInDeal / totalInvestedInDeal;
                const totalDealProfit = schedule.reduce((sum, inst) => sum + inst.interest, 0);
                totalExpectedIncome += totalDealProfit * userOwnership * 0.4;
            }
        }

        // --- WITHDRAWABLE BALANCE CALCULATION ---
        const totalWithdrawnShortTerm = (allTransactions || [])
            .filter(tx => tx.type === 'Withdrawal' && (tx.metadata?.source === 'ShortTermProfit' || tx.amount < 0))
            .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);

        return {
            longTermProfits: totalLongTermProfit,
            withdrawableBalance: Math.max(0, totalShortTermProfit - totalWithdrawnShortTerm),
            expectedIncome: totalExpectedIncome,
            totalProfitsEarned
        };
    }, [allTransactions, deals, investments, allDealInvestments, user]);


    const financialMetrics = useMemo(() => {
        if (!allTransactions) {
            return { totalCapital: 0, portfolioValue: 0, investableBalance: 0, simpleROI: 0 };
        }
        const totalCapital = allTransactions
            .filter(tx => tx.type === 'Deposit')
            .reduce((sum, tx) => sum + tx.amount, 0);

        const totalProfit = allTransactions
            .filter(tx => tx.type === 'ProfitDistribution')
            .reduce((sum, tx) => sum + tx.amount, 0);

        const totalWithdrawn = allTransactions
            .filter(tx => tx.type === 'Withdrawal' || tx.type === 'Zakat')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

        const portfolioValue = (totalCapital + totalProfit) - totalWithdrawn;
        const simpleROI = totalCapital > 0 ? (totalProfit / totalCapital) * 100 : 0;

        const investableBalance = fundBatches?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;


        return { totalCapital, portfolioValue, investableBalance, simpleROI };
    }, [allTransactions, fundBatches]);

    const withdrawalRules = useMemo(() => {
        const firstDepositDate = firstDeposit?.[0]?.createdAt?.toDate?.();
        const longTermUnlockDate = firstDepositDate ? addDays(firstDepositDate, 365) : null;
        const isLocked = longTermProfits > 0 && (!firstDepositDate || differenceInDays(new Date(), firstDepositDate) < 365);
        const lastWithdrawal = userProfile?.lastWithdrawalDate?.toDate();
        const cooldownDaysRemaining = lastWithdrawal ? Math.max(0, 90 - differenceInDays(new Date(), lastWithdrawal)) : 0;
        const cooldownActive = cooldownDaysRemaining > 0;

        const availableForWithdrawal = Math.min(longTermProfits * 0.2, financialMetrics.investableBalance);

        return {
            isLocked,
            cooldownActive,
            cooldownDaysRemaining,
            maxWithdrawal: availableForWithdrawal,
            longTermUnlockDate,
        };
    }, [longTermProfits, firstDeposit, userProfile, financialMetrics.investableBalance]);

    const pendingRequests = useMemo(() => {
        const formatAmount = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        return [
            ...(depositRequests || []).map((request) => ({ ...request, label: 'Deposit', amountLabel: formatAmount(request.amount) })),
            ...(withdrawalRequests || []).map((request) => ({ ...request, label: 'Withdrawal', amountLabel: formatAmount(request.amount) })),
            ...(reinvestmentRequests || []).map((request) => ({ ...request, label: 'Reinvestment', amountLabel: formatAmount(request.amount) })),
        ]
            .filter((request) => request.status === 'Pending')
            .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0))
            .slice(0, 6);
    }, [depositRequests, reinvestmentRequests, withdrawalRequests]);

    const chartData = useMemo(() => {
        if (!allTransactions || allTransactions.length === 0) return [];

        const sortedTransactions = [...allTransactions].sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
        const rangeWeeks = chartRange === '4w' ? 4 : chartRange === '12w' ? 12 : chartRange === '52w' ? 52 : null;
        const firstWeekStart = startOfWeek(sortedTransactions[0].createdAt.toDate(), { weekStartsOn: 1 });
        const initialWeekStart = rangeWeeks
            ? startOfWeek(subWeeks(new Date(), rangeWeeks - 1), { weekStartsOn: 1 })
            : firstWeekStart;

        const weeks: Date[] = [];
        for (let cursor = initialWeekStart; cursor <= new Date(); cursor = addDays(cursor, 7)) {
            weeks.push(cursor);
        }

        return weeks.map((weekStart) => {
            const weekEnd = addDays(weekStart, 6);
            const portfolioValue = sortedTransactions
                .filter((tx) => tx.createdAt.toDate() <= weekEnd)
                .reduce((value, tx) => {
                    if (tx.type === 'Deposit') return value + tx.amount;
                    if (tx.type === 'Withdrawal' || tx.type === 'Zakat') return value - Math.abs(tx.amount);
                    if (tx.type === 'ProfitDistribution') return value + tx.amount;
                    return value;
                }, 0);

            return {
                week: format(weekStart, 'MMM d'),
                portfolioValue,
            };
        });
    }, [allTransactions, chartRange]);

    const dealSummaries = useMemo(() => {
        if (!deals || !investments || !allDealInvestments) return [];
        return deals.map((deal) => {
            const userAmount = investments
                .filter((investment) => investment.dealId === deal.id)
                .reduce((sum, investment) => sum + investment.amount, 0);
            const totalDealInvestment = allDealInvestments
                .filter((investment) => investment.dealId === deal.id)
                .reduce((sum, investment) => sum + investment.amount, 0);
            const ownership = totalDealInvestment > 0 ? userAmount / totalDealInvestment : 0;
            const expectedProfit = deal.status === 'Active'
                ? generateAmortizationSchedule(deal).reduce((sum, inst) => sum + inst.interest, 0) * ownership * 0.4
                : 0;
            return { deal, userAmount, expectedProfit };
        });
    }, [allDealInvestments, deals, investments]);

    const handleWithdrawalSuccess = () => {
        setWithdrawOpen(false);
    };

    const formatDate = (timestamp: Timestamp | Date | undefined) => {
        if (!timestamp) return 'N/A';
        const parsedDate = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        try { return format(parsedDate, 'PPP'); } catch { return 'Invalid Date'; }
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

    return (
        <div>
            <PageHeader
                title="Investor Dashboard"
                description="Welcome to your personal investment hub."
                icon={Landmark}
            >
                <div className="flex gap-2">
                    {user && <ContactAdminSheet />}
                    <Dialog open={isDepositOpen} onOpenChange={setDepositOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Request Deposit
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Request a Deposit</DialogTitle>
                            </DialogHeader>
                            <DepositForm onDepositRequested={() => setDepositOpen(false)} />
                        </DialogContent>
                    </Dialog>
                </div>
            </PageHeader>

            <div className="mb-8">
                <BankDetailsCard />
            </div>

            {!isLoading && pendingRequests.length > 0 && (
                <Alert className="mb-8">
                    <History className="h-4 w-4" />
                    <AlertTitle>Pending Requests</AlertTitle>
                    <AlertDescription>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {pendingRequests.map((request) => (
                                <div key={`${request.label}-${request.id}`} className="rounded-md border bg-background p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium">{request.label}</span>
                                        <Badge variant="secondary">{request.status}</Badge>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{request.amountLabel}</p>
                                    <p className="text-xs text-muted-foreground">{formatDate(request.requestedAt)}</p>
                                </div>
                            ))}
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {userProfile && userProfile.legalDocumentUrl && (
                <div className="mb-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Gavel /> Legal Document</CardTitle>
                            <CardDescription>Your signed legal agreement with the platform.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="outline">
                                        <Gavel className="mr-2 h-4 w-4" /> View Legal Document
                                    </Button>
                                </SheetTrigger>
                                <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex flex-col">
                                    <SheetHeader className="flex-row items-center justify-between">
                                        <SheetTitle>Signed Legal Document</SheetTitle>
                                        <Button variant="outline" asChild>
                                            <a href={userProfile.legalDocumentUrl} download={`LegalDocument-${userProfile.name}.pdf`}>
                                                <Download className="mr-2 h-4 w-4" /> Download
                                            </a>
                                        </Button>
                                    </SheetHeader>
                                    <div className="py-4 flex-1 bg-white overflow-y-auto">
                                        {userProfile.legalDocumentUrl.startsWith('data:image/') ? (
                                            <Image src={userProfile.legalDocumentUrl} alt="Legal Document" width={800} height={1100} className="rounded-md object-contain mx-auto" />
                                        ) : (
                                            <iframe src={`${userProfile.legalDocumentUrl}#toolbar=1`} className="w-full h-full rounded-md border" />
                                        )}
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                        <span className="text-muted-foreground font-bold text-lg">₦</span>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(financialMetrics.portfolioValue)}</div>}
                        <p className="text-xs text-muted-foreground">Total stake value</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Investible Balance</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(financialMetrics.investableBalance)}</div>}
                        <p className="text-xs text-muted-foreground">Ready for new deals</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Profits Shared</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(totalProfitsEarned)}</div>}
                        <p className="text-xs text-muted-foreground">Cumulative earned</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Expected Income</CardTitle>
                        <History className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(expectedIncome)}</div>}
                        <p className="text-xs text-muted-foreground">From active deals</p>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Withdrawable</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{formatCurrency(withdrawableBalance)}</div>}
                        <Dialog open={isWithdrawOpen} onOpenChange={setWithdrawOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full mt-1"
                                    disabled={withdrawableBalance <= 0}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Withdraw
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Request Fund Withdrawal</DialogTitle>
                                </DialogHeader>
                                <WithdrawForm withdrawableBalance={withdrawableBalance} onWithdrawalRequested={handleWithdrawalSuccess} />
                            </DialogContent>
                        </Dialog>
                        {user && <ReinvestButton balance={withdrawableBalance} user={user} />}
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Short-Term Profit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{formatCurrency(withdrawableBalance)}</div>
                        <p className="text-xs text-muted-foreground">Available for withdrawal or reinvestment.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Long-Term Profit Pool</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{formatCurrency(longTermProfits)}</div>
                        <p className="text-xs text-muted-foreground">
                            {withdrawalRules.isLocked
                                ? `Locked until ${withdrawalRules.longTermUnlockDate ? format(withdrawalRules.longTermUnlockDate, 'PPP') : 'your first deposit matures'}.`
                                : `${formatCurrency(withdrawalRules.maxWithdrawal)} is within the 20% long-term rule.`}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Withdrawal Cooldown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {withdrawalRules.cooldownActive ? `${withdrawalRules.cooldownDaysRemaining} days` : 'Open'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {withdrawalRules.cooldownActive ? 'Time remaining before another scheduled withdrawal.' : 'No recent withdrawal cooldown is active.'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-8">
                <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Financial Activity</CardTitle>
                        <CardDescription>Your portfolio value across the selected period.</CardDescription>
                    </div>
                    <Select value={chartRange} onValueChange={(value) => setChartRange(value as typeof chartRange)}>
                        <SelectTrigger className="w-full sm:w-40">
                            <SelectValue placeholder="Chart range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="4w">4 weeks</SelectItem>
                            <SelectItem value="12w">12 weeks</SelectItem>
                            <SelectItem value="52w">52 weeks</SelectItem>
                            <SelectItem value="all">All time</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="pl-2">
                    {isLoading ? (
                        <div className="h-[250px] w-full flex items-center justify-center">
                            <Skeleton className="h-full w-full" />
                        </div>
                    ) : (
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <LineChart
                                accessibilityLayer
                                data={chartData}
                                margin={{
                                    left: 12,
                                    right: 12,
                                    top: 10,
                                    bottom: 10,
                                }}
                            >
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="week"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    tickFormatter={(value) => {
                                        if (value >= 1000000) return `₦${Number(value) / 1000000}M`;
                                        return `₦${Math.round(Number(value) / 1000)}K`;
                                    }}
                                />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={<ChartTooltipContent indicator="dot" formatter={(value) => formatCurrency(Number(value))} />}
                                />
                                <Line
                                    dataKey="portfolioValue"
                                    type="natural"
                                    stroke="var(--color-portfolioValue)"
                                    strokeWidth={3}
                                    dot={{
                                        fill: "var(--color-portfolioValue)",
                                        r: 4,
                                    }}
                                    activeDot={{
                                        r: 6,
                                    }}
                                />
                            </LineChart>
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Withdrawal History
                    </CardTitle>
                    <CardDescription>Recent status of your withdrawal requests.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                        </div>
                    ) : !withdrawalRequests || withdrawalRequests.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">No withdrawal requests found.</p>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Requested On</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead className="text-right">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {withdrawalRequests.map((req) => (
                                        <TableRow key={req.id}>
                                            <TableCell>{format(req.requestedAt.toDate(), 'PPP')}</TableCell>
                                            <TableCell className="font-medium">{formatCurrency(req.amount)}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={req.status === 'Approved' ? 'default' : req.status === 'Rejected' ? 'destructive' : 'secondary'}>
                                                    {req.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {user && <UninvestedCapitalCard batches={fundBatches} user={user} />}


            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        My Invested Deals
                        <Badge variant="secondary">Mudaraba (Profit-Sharing)</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
                        </div>
                    ) : isMobile ? (
                        <div className="space-y-3">
                            {dealSummaries.length > 0 ? dealSummaries.map(({ deal, userAmount, expectedProfit }) => (
                                <Card key={deal.id}>
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <p className="font-medium">{deal.dealName}</p>
                                            <Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Financing Mode: <span className="font-medium text-foreground">{deal.financingMode || 'Murabaha'}</span>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Your investment: {formatCurrency(userAmount)}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Expected profit: {formatCurrency(expectedProfit)}
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="w-full">
                                            <Link href={`/investor/transactions?dealId=${deal.id}`}>View related activity</Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            )) : (
                                <div className="text-center text-sm text-muted-foreground py-10">You have not invested in any deals yet.</div>
                            )}
                        </div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Deal Name</TableHead>
                                        <TableHead>Mode</TableHead>
                                        <TableHead>Your Investment</TableHead>
                                        <TableHead>Expected Profit</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!isLoading && dealSummaries.map(({ deal, userAmount, expectedProfit }) => (
                                        <TableRow key={deal.id}>
                                            <TableCell data-label="Deal Name" className="font-medium">{deal.dealName}</TableCell>
                                            <TableCell data-label="Mode"><Badge variant="outline">{deal.financingMode || 'Murabaha'}</Badge></TableCell>
                                            <TableCell data-label="Your Investment">{formatCurrency(userAmount)}</TableCell>
                                            <TableCell data-label="Expected Profit">{formatCurrency(expectedProfit)}</TableCell>
                                            <TableCell data-label="Status"><Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/investor/transactions?dealId=${deal.id}`}>Activity</Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && dealSummaries.length === 0 && (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">You have not invested in any deals yet.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="mt-8">
                <CardHeader className="flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        <CardTitle>Recent Transaction History</CardTitle>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/investor/transactions">
                            View All <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                        </div>
                    ) : isMobile ? (
                        <div className="space-y-3">
                            {recentTransactions && recentTransactions.length > 0 ? recentTransactions.map((tx) => (
                                <Card key={tx.id}>
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                            <p className={`font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                                {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                            </p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{tx.dealName || 'N/A'}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                                    </CardContent>
                                </Card>
                            )) : (
                                <div className="text-center text-sm text-muted-foreground py-10">No transactions yet.</div>
                            )}
                        </div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!isLoading && recentTransactions?.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell data-label="Date">{formatDate(tx.createdAt)}</TableCell>
                                            <TableCell data-label="Type">
                                                <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                                            </TableCell>
                                            <TableCell data-label="Details">{tx.dealName || 'N/A'}</TableCell>
                                            <TableCell data-label="Amount" className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : 'text-foreground'}`}>
                                                {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && recentTransactions?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                No transactions yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
