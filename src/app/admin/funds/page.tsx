
'use client';

import { PageHeader } from "@/components/page-header";
import { Banknote, History, Landmark, Wallet } from "lucide-react";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, DocumentData, Timestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";


type PlatformFundBatch = DocumentData & {
  id: string;
  sourceId: 'platform';
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
  details?: string;
};

type PlatformTransaction = DocumentData & {
    id: string;
    userId: 'platform';
    type: 'PlatformEarning' | 'Investment';
    amount: number;
    createdAt: Timestamp;
}

const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, 'PPP p');
    } catch {
      return 'Invalid Date';
    }
  };

export default function PlatformFundsPage() {
    const firestore = useFirestore();

    const fundBatchesQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'fundBatches'), where('sourceId', '==', 'platform'));
    }, [firestore]);

    const transactionsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'transactions'), where('userId', '==', 'platform'));
    }, [firestore]);
    
    const { data: fundBatches, loading: batchesLoading } = useCollection<PlatformFundBatch>(fundBatchesQuery);
    const { data: transactions, loading: transactionsLoading } = useCollection<PlatformTransaction>(transactionsQuery);

    const isLoading = batchesLoading || transactionsLoading;

    const metrics = useMemo(() => {
        const totalEarnings = transactions
            ?.filter(tx => tx.type === 'PlatformEarning')
            .reduce((sum, tx) => sum + tx.amount, 0) || 0;
            
        const totalInvested = transactions
            ?.filter(tx => tx.type === 'Investment')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

        const investibleCapital = fundBatches
            ?.reduce((sum, batch) => sum + batch.remainingAmount, 0) || 0;

        return { totalEarnings, totalInvested, investibleCapital };
    }, [transactions, fundBatches]);


    return (
        <div>
            <PageHeader
                title="Platform Account"
                description="An overview of the platform's internal funds, earnings, and investments."
                icon={Banknote}
            />

            <div className="grid gap-6 md:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Platform Earnings</CardTitle>
                        <span className="text-muted-foreground font-bold text-lg">₦</span>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalEarnings)}</div>}
                        <p className="text-xs text-muted-foreground">Sum of all 'PlatformEarning' transactions.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Capital Invested</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.totalInvested)}</div>}
                        <p className="text-xs text-muted-foreground">Total amount the platform has invested in deals.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Current Investible Capital</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(metrics.investibleCapital)}</div>}
                        <p className="text-xs text-muted-foreground">Available funds for new deals.</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        <span>Platform Fund Batches</span>
                    </CardTitle>
                    <CardDescription>
                        Capital earned by the platform, now available for investment in new deals.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Date Created</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead>Original Amount</TableHead>
                            <TableHead className="text-right">Investible Balance</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {isLoading && Array.from({length: 3}).map((_, i) => (
                           <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && fundBatches?.map(batch => (
                            <TableRow key={batch.id}>
                                <TableCell>{formatDate(batch.createdAt)}</TableCell>
                                <TableCell><Badge variant="secondary">{batch.details || 'Platform Earning'}</Badge></TableCell>
                                <TableCell className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.amount)}</TableCell>
                                <TableCell className="text-right text-green-500 font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(batch.remainingAmount)}</TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && !fundBatches?.length && (
                             <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No fund batches found for the platform.
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
