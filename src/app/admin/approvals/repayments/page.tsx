
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp, runTransaction, doc, getDocs, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Deal } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';

type Repayment = DocumentData & {
  id: string;
  dealId: string;
  clientId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  lodgedAt: Timestamp;
};

type User = {
    id: string;
    name: string;
}

type Investment = {
    id: string;
    investorId: string;
    amount: number;
}

type RepaymentRow = Repayment & {
    clientName: string;
    dealName: string;
}

// Mock function to simulate creating some pending repayments for testing
async function seedRepayments(firestore: any) {
    const repaymentsRef = collection(firestore, 'repayments');
    const q = query(repaymentsRef, where('status', '==', 'Pending'));
    const existing = await getDocs(q);
    if (existing.empty) {
        console.log("Seeding mock repayments...");
        const dealsRef = collection(firestore, "deals");
        const dealsSnapshot = await getDocs(dealsRef);
        if (dealsSnapshot.empty) {
            console.log("No deals found to seed repayments for.");
            return;
        }
        const deal = dealsSnapshot.docs[0].data() as Deal;
        const dealId = dealsSnapshot.docs[0].id;
        
        const batch = writeBatch(firestore);
        const repayment1 = doc(repaymentsRef);
        batch.set(repayment1, {
            dealId: dealId,
            clientId: deal.clientId,
            amount: deal.principal * (deal.interestRate / 100) / 12, // Simulate one month interest
            status: 'Pending',
            lodgedAt: Timestamp.now(),
        });
        const repayment2 = doc(repaymentsRef);
        batch.set(repayment2, {
            dealId: dealId,
            clientId: deal.clientId,
            amount: deal.principal * (deal.interestRate / 100) / 12, // Simulate one month interest
            status: 'Pending',
            lodgedAt: Timestamp.now(),
        });
        await batch.commit();
    }
}


export default function RepaymentsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [approvingId, setApprovingId] = useState<string | null>(null);

    // Seed data on component mount if needed (dev only)
    // React.useEffect(() => {
    //     if (firestore && process.env.NODE_ENV === 'development') {
    //         seedRepayments(firestore);
    //     }
    // }, [firestore]);

    const pendingRepaymentsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'repayments'), where('status', '==', 'Pending'));
    }, [firestore]);
    
    // We need deals and users to enrich the repayment data
    const dealsQuery = useMemo(() => firestore ? collection(firestore, 'deals') : null, [firestore]);
    const usersQuery = useMemo(() => firestore ? collection(firestore, 'users') : null, [firestore]);

    const { data: pendingRepayments, loading: repaymentsLoading } = useCollection<Repayment>(pendingRepaymentsQuery);
    const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
    const { data: users, loading: usersLoading } = useCollection<User>(usersQuery);

    const isLoading = repaymentsLoading || dealsLoading || usersLoading;

    const repaymentRows = useMemo((): RepaymentRow[] => {
        if (!pendingRepayments || !deals || !users) return [];
        return pendingRepayments.map(repayment => {
            const deal = deals.find(d => d.id === repayment.dealId);
            const client = users.find(u => u.id === repayment.clientId);
            return {
                ...repayment,
                dealName: deal?.dealName || 'Unknown Deal',
                clientName: client?.name || 'Unknown Client',
            }
        })
    }, [pendingRepayments, deals, users]);

    const handleApprove = async (repayment: RepaymentRow) => {
        if (!firestore) return;
        setApprovingId(repayment.id);

        try {
            await runTransaction(firestore, async (transaction) => {
                // 1. Get all investments for this deal
                const investmentsQuery = query(collection(firestore, 'investments'), where('dealId', '==', repayment.dealId));
                const investmentsSnapshot = await getDocs(investmentsQuery);
                const investments = investmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Investment));

                if (investments.length === 0) {
                    throw new Error("No investors found for this deal. Cannot distribute funds.");
                }

                // 2. Calculate total amount invested in this deal
                const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);

                // 3. For each investor, calculate their share of the profit and distribute it
                const batch = writeBatch(firestore);

                for (const investment of investments) {
                    const investorProportion = investment.amount / totalInvested;
                    const repaymentSlice = repayment.amount * investorProportion;

                    const investorProfit = repaymentSlice * 0.40; // Investor gets 40%
                    
                    // Create a profit distribution transaction for the investor
                    const profitTxRef = doc(collection(firestore, 'transactions'));
                    batch.set(profitTxRef, {
                        userId: investment.investorId,
                        dealId: repayment.dealId,
                        type: 'ProfitDistribution',
                        amount: investorProfit,
                        createdAt: Timestamp.now(),
                        dealName: repayment.dealName,
                    });
                }
                
                // 4. Update the repayment status to 'Approved'
                const repaymentRef = doc(firestore, 'repayments', repayment.id);
                batch.update(repaymentRef, {
                    status: 'Approved',
                    approvedAt: Timestamp.now(),
                });
                
                // Commit the batch of writes
                await batch.commit();
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
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Deal</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date Lodged</TableHead>
                        <TableHead className="text-right">Action</TableHead>
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
                            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                        </TableRow>
                        ))}
                    {!isLoading && repaymentRows.map((repayment) => (
                        <TableRow key={repayment.id}>
                            <TableCell className="font-medium">{repayment.clientName}</TableCell>
                            <TableCell>{repayment.dealName}</TableCell>
                            <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</TableCell>
                            <TableCell>{format(repayment.lodgedAt.toDate(), 'PPP')}</TableCell>
                            <TableCell className="text-right">
                                <Button
                                    size="sm"
                                    onClick={() => handleApprove(repayment)}
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
                        </TableRow>
                    ))}
                    {!isLoading && repaymentRows.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                No pending repayments.
                            </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        </div>
    );
}
