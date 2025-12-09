
'use client';

import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Clock, CalendarCheck, AlertTriangle } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, runTransaction, doc, writeBatch, orderBy, getDocs, addDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Deal } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { useIsMobile } from '@/hooks/use-mobile';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePathname } from 'next/navigation';


type Repayment = DocumentData & {
  id: string;
  dealId: string;
  clientId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  lodgedAt: Timestamp;
  approvedAt?: Timestamp;
  dueDate: Timestamp;
  installmentNumber: number;
};

type User = {
    id: string;
    name: string;
}

type Investment = {
    id: string;
    investorId: string;
    amount: number;
    dealId: string;
}

type RepaymentRow = Repayment & {
    clientName: string;
    dealName: string;
}

// New hook to clear notifications when a page is visited
function useClearNotificationsByPath() {
    const firestore = useFirestore();
    const pathname = usePathname();

    useEffect(() => {
        if (!firestore || !pathname) return;

        const clearNotifications = async () => {
            const notificationsToClearQuery = query(
                collection(firestore, 'notifications'),
                where('link', '==', pathname),
                where('read', '==', false)
            );
            
            const snapshot = await getDocs(notificationsToClearQuery);
            if (snapshot.empty) return;

            const batch = writeBatch(firestore);
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            
            await batch.commit();
        };

        const timer = setTimeout(clearNotifications, 500);
        return () => clearTimeout(timer);

    }, [firestore, pathname]);
}

function RepaymentsTable({
    repayments,
    isLoading,
    showApproveButton,
    onApprove
}: {
    repayments: RepaymentRow[],
    isLoading: boolean,
    showApproveButton: boolean,
    onApprove?: (repayment: RepaymentRow) => void
}) {
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const handleApproveClick = (repayment: RepaymentRow) => {
        setApprovingId(repayment.id);
        onApprove?.(repayment);
    };
    
    const formatDate = (date: Date) => format(date, 'PPP');

    if (isLoading) {
        return (
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
            </div>
        );
    }
    
    if (repayments.length === 0) {
        return (
             <div className="p-4 py-12 text-center text-sm text-muted-foreground border rounded-lg">
                No repayments found in this category.
            </div>
        );
    }

    if (isMobile) {
        return (
            <div className="space-y-3">
                {repayments.map((repayment) => (
                    <Card key={repayment.id}>
                        <CardContent className="p-4 space-y-3">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-medium">{repayment.clientName}</p>
                                    <p className="text-sm text-primary font-bold">{repayment.dealName}</p>
                                    <p className="text-sm text-muted-foreground font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</p>
                                </div>
                                {!showApproveButton && <Badge variant={repayment.status === 'Approved' ? 'default' : 'destructive'}>{repayment.status}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p><strong>Due Date:</strong> {formatDate(repayment.dueDate.toDate())}</p>
                                <p><strong>Date Lodged:</strong> {formatDate(repayment.lodgedAt.toDate())}</p>
                            </div>

                            {showApproveButton && (
                                <div className="flex justify-end pt-2 border-t">
                                     <Button
                                        size="sm"
                                        onClick={() => handleApproveClick(repayment)}
                                        disabled={approvingId === repayment.id}
                                    >
                                        {approvingId === repayment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                        Approve
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Deal</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Date Lodged</TableHead>
                            {showApproveButton && <TableHead className="text-right">Action</TableHead>}
                            {!showApproveButton && <TableHead>Status</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {repayments.map((repayment) => (
                            <TableRow key={repayment.id}>
                                <TableCell data-label="Client" className="font-medium">{repayment.clientName}</TableCell>
                                <TableCell data-label="Deal">{repayment.dealName}</TableCell>
                                <TableCell data-label="Amount">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</TableCell>
                                <TableCell data-label="Due Date">{formatDate(repayment.dueDate.toDate())}</TableCell>
                                <TableCell data-label="Date Lodged">{formatDate(repayment.lodgedAt.toDate())}</TableCell>
                                {showApproveButton ? (
                                    <TableCell data-label="Action" className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApproveClick(repayment)}
                                            disabled={approvingId === repayment.id}
                                        >
                                            {approvingId === repayment.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                            )}
                                            Approve
                                        </Button>
                                    </TableCell>
                                ) : (
                                    <TableCell data-label="Status">
                                        <Badge variant={repayment.status === 'Approved' ? 'default' : 'destructive'}>{repayment.status}</Badge>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}


export default function RepaymentsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    useClearNotificationsByPath();

    // Queries for each tab
    const pendingRepaymentsQuery = useMemo(() => firestore ? query(collection(firestore, 'repayments'), where('status', '==', 'Pending'), orderBy('lodgedAt', 'asc')) : null, [firestore]);
    const confirmedRepaymentsQuery = useMemo(() => firestore ? query(collection(firestore, 'repayments'), where('status', '==', 'Approved'), orderBy('approvedAt', 'desc')) : null, [firestore]);
    const overdueRepaymentsQuery = useMemo(() => firestore ? query(collection(firestore, 'repayments'), where('status', '==', 'Pending'), where('dueDate', '<', Timestamp.now())) : null, [firestore]);
    
    // We need deals and users to enrich the repayment data for all tabs
    const dealsQuery = useMemo(() => firestore ? collection(firestore, 'deals') : null, [firestore]);
    const usersQuery = useMemo(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const investmentsQuery = useMemo(() => firestore ? collection(firestore, 'investments') : null, [firestore]);

    const { data: pendingRepayments, loading: pendingLoading } = useCollection<Repayment>(pendingRepaymentsQuery);
    const { data: confirmedRepayments, loading: confirmedLoading } = useCollection<Repayment>(confirmedRepaymentsQuery);
    const { data: overdueRepayments, loading: overdueLoading } = useCollection<Repayment>(overdueRepaymentsQuery);

    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);
    const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);

    const isLoading = dealsLoading || usersLoading || investmentsLoading;

    const enrichRepayments = (repayments: Repayment[] | null): RepaymentRow[] => {
        if (!repayments || !deals || !users) return [];
        return repayments.map(repayment => {
            const deal = deals.find(d => d.id === repayment.dealId);
            const client = users.find(u => u.id === repayment.clientId);
            return {
                ...repayment,
                dealName: deal?.dealName || 'Unknown Deal',
                clientName: client?.name || 'Unknown Client',
            }
        });
    };

    const pendingRows = useMemo(() => enrichRepayments(pendingRepayments), [pendingRepayments, deals, users]);
    const confirmedRows = useMemo(() => enrichRepayments(confirmedRepayments), [confirmedRepayments, deals, users]);
    const overdueRows = useMemo(() => enrichRepayments(overdueRepayments), [overdueRepayments, deals, users]);


    const handleApprove = async (repayment: RepaymentRow) => {
        if (!firestore || !deals) return;
        setApprovingId(repayment.id);

        try {
            await runTransaction(firestore, async (transaction) => {
                const deal = deals.find(d => d.id === repayment.dealId);
                if (!deal) throw new Error("Associated deal not found.");

                const schedule = generateAmortizationSchedule(deal);
                const currentInstallment = schedule.find(inst => inst.installment === (repayment.installmentNumber || 1));
                if (!currentInstallment) throw new Error("Could not find matching installment in amortization schedule.");
                
                const totalInterestForPeriod = currentInstallment.interest;
                const principalRepaid = currentInstallment.principal;

                const investmentsForDeal = investments?.filter(inv => inv.dealId === repayment.dealId) || [];

                if (investmentsForDeal.length === 0) throw new Error("No investors found for this deal.");

                const totalInvested = investmentsForDeal.reduce((sum, inv) => sum + inv.amount, 0);

                // 1. Distribute profit to investors
                for (const investment of investmentsForDeal) {
                    const investorProportion = investment.amount / totalInvested;
                    const investorProfit = totalInterestForPeriod * investorProportion * 0.40; // 40% of their proportional interest share

                    const profitTxRef = doc(collection(firestore, 'transactions'));
                    transaction.set(profitTxRef, {
                        userId: investment.investorId,
                        dealId: repayment.dealId,
                        type: 'ProfitDistribution',
                        amount: investorProfit,
                        createdAt: Timestamp.now(),
                        dealName: repayment.dealName,
                    });
                }
                
                const now = Timestamp.now();
                // 2. Log platform earning and batch it
                const platformProfit = totalInterestForPeriod * 0.60;

                const platformTxRef = doc(collection(firestore, 'transactions'));
                transaction.set(platformTxRef, {
                    userId: 'platform',
                    dealId: repayment.dealId,
                    type: 'PlatformEarning',
                    amount: platformProfit,
                    createdAt: now,
                    dealName: repayment.dealName
                });

                const platformFundBatchRef = doc(collection(firestore, 'fundBatches'));
                transaction.set(platformFundBatchRef, {
                    sourceId: 'platform',
                    amount: platformProfit,
                    remainingAmount: platformProfit,
                    createdAt: now,
                    tenureValue: 10, // Default long tenure for platform earnings
                    tenureUnit: 'Years',
                    details: `Profit from ${repayment.dealName}`
                });

                // 3. Log principal repayment transaction for record keeping
                const repaymentTxRef = doc(collection(firestore, 'transactions'));
                transaction.set(repaymentTxRef, {
                    userId: repayment.clientId,
                    dealId: repayment.dealId,
                    type: 'Repayment',
                    amount: -principalRepaid,
                    createdAt: now,
                    dealName: repayment.dealName
                });


                // 4. Update repayment status
                const repaymentRef = doc(firestore, 'repayments', repayment.id);
                transaction.update(repaymentRef, {
                    status: 'Approved',
                    approvedAt: now,
                });
            });

            toast({
                title: "Repayment Approved",
                description: `Profit from ${repayment.dealName} has been distributed.`,
            });
        } catch (error) {
            console.error("Approval Error: ", error);
            toast({
                variant: 'destructive',
                title: "Approval Failed",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
        } finally {
            setApprovingId(null);
        }
    };
  
    const tabItems = [
        { value: "pending", label: "Pending", icon: Clock },
        { value: "confirmed", label: "Confirmed", icon: CalendarCheck },
        { value: "overdue", label: "Overdue", icon: AlertTriangle },
    ];
  
    return (
        <div>
            <PageHeader
                title="Repayment Approvals"
                description="Confirm client repayments and manage fund distribution."
                icon={CheckCircle}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList>
                    <TooltipProvider>
                        {tabItems.map(({ value, label, icon: Icon }) => (
                            <Tooltip key={value} delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <TabsTrigger value={value}>
                                        <Icon className={isMobile ? '' : 'mr-2 h-4 w-4'} />
                                        <span className={isMobile ? 'sr-only' : ''}>{label}</span>
                                    </TabsTrigger>
                                </TooltipTrigger>
                                {isMobile && (
                                     <TooltipContent side="bottom">
                                        <p>{label}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        ))}
                    </TooltipProvider>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <RepaymentsTable
                        repayments={pendingRows}
                        isLoading={isLoading || pendingLoading}
                        showApproveButton={true}
                        onApprove={handleApprove}
                    />
                </TabsContent>
                <TabsContent value="confirmed" className="mt-4">
                     <RepaymentsTable
                        repayments={confirmedRows}
                        isLoading={isLoading || confirmedLoading}
                        showApproveButton={false}
                    />
                </TabsContent>
                 <TabsContent value="overdue" className="mt-4">
                     <RepaymentsTable
                        repayments={overdueRows}
                        isLoading={isLoading || overdueLoading}
                        showApproveButton={true}
                        onApprove={handleApprove}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
