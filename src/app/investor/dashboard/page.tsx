
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Landmark, History, FileText } from "lucide-react";
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Deal } from "@/lib/types";

type FundBatch = DocumentData & {
  id: string;
  sourceId: string;
  amount: number;
};

type Transaction = DocumentData & {
  id: string;
  type: 'Deposit' | 'Withdrawal' | 'Investment' | 'Repayment' | 'ProfitDistribution';
  amount: number;
  dealId?: string;
  userId: string;
  createdAt: Timestamp;
  dealName?: string; // Denormalized for display
};

type Investment = DocumentData & {
  investorId: string;
  dealId: string;
};

export default function InvestorDashboard() {
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();

  const fundBatchesQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'fundBatches'), where('sourceId', '==', user.uid));
  }, [firestore, user]);

  const transactionsQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'transactions'), where('userId', '==', user.uid));
  }, [firestore, user]);
  
  // Find which deals the investor is invested in
  const investmentsQuery = useMemo(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'investments'), where('investorId', '==', user.uid));
  }, [firestore, user]);

  const { data: investments, loading: investmentsLoading } = useCollection<Investment>(investmentsQuery);

  // Get the IDs of the deals the investor is in
  const investedDealIds = useMemo(() => {
      return investments?.map(inv => inv.dealId) || [];
  }, [investments]);
  
  // Now, fetch the actual deal documents
  const dealsQuery = useMemo(() => {
      if (!firestore || !investedDealIds.length) return null;
      return query(collection(firestore, 'deals'), where('__name__', 'in', investedDealIds));
  }, [firestore, investedDealIds]);
  
  const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);

  const { data: fundBatches, loading: fundBatchesLoading } = useCollection<FundBatch>(fundBatchesQuery);
  const { data: transactions, loading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const isLoading = userLoading || fundBatchesLoading || transactionsLoading || investmentsLoading || dealsLoading;

  const totalCapital = useMemo(() => {
    return fundBatches?.reduce((sum, batch) => sum + batch.amount, 0) ?? 0;
  }, [fundBatches]);

  const portfolioValue = useMemo(() => {
    return transactions?.reduce((sum, tx) => sum + tx.amount, 0) ?? 0;
  }, [transactions]);

  const simpleROI = useMemo(() => {
    if (totalCapital === 0) {
      return 0;
    }
    const returns = portfolioValue - totalCapital;
    return (returns / totalCapital) * 100;
  }, [totalCapital, portfolioValue]);
  
  const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, 'PPP');
    } catch {
      return 'Invalid Date';
    }
  };


  return (
    <div>
      <PageHeader
        title="Investor Dashboard"
        description="Welcome to your personal investment hub."
        icon={Landmark}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Capital</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">₦</span>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalCapital)}</div>}
            <p className="text-xs text-muted-foreground">Total funds deposited</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">₦</span>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(portfolioValue)}</div>}
            <p className="text-xs text-muted-foreground">Based on all transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Simple ROI</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{simpleROI.toFixed(2)}%</div>}
            <p className="text-xs text-muted-foreground">Based on capital vs portfolio value</p>
          </CardContent>
        </Card>
      </div>

       <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            My Invested Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
           <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal Name</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Interest Rate</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({length: 1}).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && deals?.map((deal) => (
                 <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.dealName}</TableCell>
                    <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(deal.principal)}</TableCell>
                    <TableCell>{deal.interestRate}%</TableCell>
                    <TableCell><Badge variant={deal.status === 'Active' ? 'default' : 'secondary'}>{deal.status}</Badge></TableCell>
                 </TableRow>
              ))}
              {!isLoading && deals?.length === 0 && (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">You have not invested in any deals yet.</TableCell></TableRow>
              )}
            </TableBody>
           </Table>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
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
              {isLoading && Array.from({length: 3}).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && transactions?.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatDate(tx.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={tx.amount > 0 ? 'secondary' : 'outline'}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell>{tx.dealName || 'N/A'}</TableCell>
                  <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-green-500' : 'text-foreground'}`}>
                    {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}
               {!isLoading && transactions?.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        No transactions yet.
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
