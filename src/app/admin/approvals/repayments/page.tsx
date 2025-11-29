
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
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, runTransaction, doc, writeBatch, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Deal } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

type Repayment = DocumentData & {
  id: string;
  dealId: string;
  clientId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  lodgedAt: Timestamp;
  approvedAt?: Timestamp;
  dueDate: Timestamp;
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

    const handleApproveClick = (repayment: RepaymentRow) => {
        setApprovingId(repayment.id);
        onApprove?.(repayment);
        // Note: approvingId will be reset by the parent component's logic
    };

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
                        {isLoading &&
                            Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                    <TableCell className="text-right">
                                        {showApproveButton ? <Skeleton className="h-8 w-24 ml-auto" /> : <Skeleton className="h-5 w-20" />}
                                    </TableCell>
                                </TableRow>
                            ))}
                        {!isLoading && repayments.map((repayment) => (
                            <TableRow key={repayment.id}>
                                <TableCell className="font-medium">{repayment.clientName}</TableCell>
                                <TableCell>{repayment.dealName}</TableCell>
                                <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</TableCell>
                                <TableCell>{format(repayment.dueDate.toDate(), 'PPP')}</TableCell>
                                <TableCell>{format(repayment.lodgedAt.toDate(), 'PPP')}</TableCell>
                                {showApproveButton ? (
                                    <TableCell className="text-right">
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
                                    <TableCell>
                                        <Badge variant={repayment.status === 'Approved' ? 'default' : 'destructive'}>{repayment.status}</Badge>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                        {!isLoading && repayments.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No repayments found in this category.
                                </TableCell>
                            </TableRow>
                        )}
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
        if (!firestore) return;
        setApprovingId(repayment.id);

        try {
            await runTransaction(firestore, async (transaction) => {
                const investmentsForDeal = investments?.filter(inv => inv.dealId === repayment.dealId) || [];

                if (investmentsForDeal.length === 0) throw new Error("No investors found for this deal.");

                const totalInvested = investmentsForDeal.reduce((sum, inv) => sum + inv.amount, 0);

                for (const investment of investmentsForDeal) {
                    const investorProportion = investment.amount / totalInvested;
                    const repaymentSlice = repayment.amount * investorProportion;
                    const investorProfit = repaymentSlice * 0.40;

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
                
                const repaymentRef = doc(firestore, 'repayments', repayment.id);
                transaction.update(repaymentRef, {
                    status: 'Approved',
                    approvedAt: Timestamp.now(),
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
  
    return (
        <div>
            <PageHeader
                title="Repayment Approvals"
                description="Confirm client repayments and manage fund distribution."
                icon={CheckCircle}
            />
            <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pending">
                        <Clock className="mr-2 h-4 w-4" />
                        Pending
                    </TabsTrigger>
                    <TabsTrigger value="confirmed">
                        <CalendarCheck className="mr-2 h-4 w-4" />
                        Confirmed
                    </TabsTrigger>
                    <TabsTrigger value="overdue">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Overdue
                    </TabsTrigger>
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
