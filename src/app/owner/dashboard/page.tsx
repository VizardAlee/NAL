'use client';

import { useMemo } from 'react';
import { Crown, Landmark, PieChart, TrendingUp } from 'lucide-react';
import { Timestamp, collection, query, where, orderBy, limit, DocumentData } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';

type Transaction = DocumentData & {
  id: string;
  type: string;
  amount: number;
  createdAt: Timestamp;
};

type Deal = DocumentData & {
  id: string;
  status: 'Active' | 'Pending' | 'Completed' | 'Terminated';
};

type Repayment = DocumentData & {
  id: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  dueDate?: Timestamp;
  amount: number;
};

type Loan = DocumentData & {
  id: string;
  status: 'Active' | 'Repaid';
  outstanding: number;
};

type OwnerAllocation = DocumentData & {
  id: string;
  sourceTransactionId: string;
  retainedAmount: number;
  distributableAmount: number;
  createdAt?: Timestamp;
  status?: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value || 0);

export default function OwnerDashboardPage() {
  const firestore = useFirestore();

  const usersQuery = useMemo(() => (firestore ? query(collection(firestore, 'users')) : null), [firestore]);
  const dealsQuery = useMemo(() => (firestore ? query(collection(firestore, 'deals')) : null), [firestore]);
  const earningsQuery = useMemo(
    () => (firestore ? query(collection(firestore, 'transactions'), where('type', '==', 'PlatformEarning')) : null),
    [firestore]
  );
  const pendingRepaymentsQuery = useMemo(
    () => (firestore ? query(collection(firestore, 'repayments'), where('status', '==', 'Pending')) : null),
    [firestore]
  );
  const activeLoansQuery = useMemo(
    () => (firestore ? query(collection(firestore, 'interAccountLoans'), where('status', '==', 'Active')) : null),
    [firestore]
  );
  const ownerAllocationsQuery = useMemo(
    () => (firestore ? query(collection(firestore, 'ownerProfitAllocations'), orderBy('createdAt', 'desc'), limit(6)) : null),
    [firestore]
  );

  const { data: users, loading: usersLoading } = useCollection<DocumentData>(usersQuery);
  const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
  const { data: earnings, loading: earningsLoading } = useCollection<Transaction>(earningsQuery);
  const { data: pendingRepayments, loading: repaymentsLoading } = useCollection<Repayment>(pendingRepaymentsQuery);
  const { data: activeLoans, loading: loansLoading } = useCollection<Loan>(activeLoansQuery);
  const { data: ownerAllocations, loading: allocationsLoading } = useCollection<OwnerAllocation>(ownerAllocationsQuery);

  const metrics = useMemo(() => {
    const platformEarnings = (earnings || []).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const activeDeals = (deals || []).filter((deal) => deal.status === 'Active').length;
    const totalUsers = (users || []).length;
    const overduePending = (pendingRepayments || []).filter((r) => {
      if (!r.dueDate) return false;
      return r.dueDate.toDate() < new Date();
    });
    const overdueAmount = overduePending.reduce((sum, repayment) => sum + (Number(repayment.amount) || 0), 0);
    const adminDebtToPlatform = (activeLoans || []).reduce((sum, loan) => sum + (Number(loan.outstanding) || 0), 0);
    return {
      platformEarnings,
      activeDeals,
      totalUsers,
      overdueCount: overduePending.length,
      overdueAmount,
      adminDebtToPlatform,
    };
  }, [earnings, deals, users, pendingRepayments, activeLoans]);

  const isLoading = usersLoading || dealsLoading || earningsLoading || repaymentsLoading || loansLoading || allocationsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Dashboard"
        description="Strategic, read-only view of platform health, risk, and ownership allocation."
        icon={Crown}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Platform Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.platformEarnings)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Administrative Debt to Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.adminDebtToPlatform)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue Pending Repayments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-3/4" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics.overdueCount}</div>
                <p className="text-xs text-muted-foreground">Total overdue amount: {formatCurrency(metrics.overdueAmount)}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operational Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-3/4" />
            ) : (
              <div className="space-y-1 text-sm">
                <p>Active deals: <span className="font-semibold">{metrics.activeDeals}</span></p>
                <p>Total users: <span className="font-semibold">{metrics.totalUsers}</span></p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Recent Owner Profit Allocations
          </CardTitle>
          <CardDescription>
            Latest automatic allocations from platform earnings into retained and owner-distributed portions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {allocationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !ownerAllocations || ownerAllocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No owner allocations recorded yet.</p>
          ) : (
            ownerAllocations.map((allocation) => (
              <div key={allocation.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">Source TX: {allocation.sourceTransactionId}</p>
                  <p className="text-xs text-muted-foreground">
                    Retained: {formatCurrency(Number(allocation.retainedAmount) || 0)} | Distributed: {formatCurrency(Number(allocation.distributableAmount) || 0)}
                  </p>
                </div>
                <Badge variant={allocation.status === 'Completed' ? 'default' : 'secondary'}>
                  {allocation.status || 'Recorded'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Earnings Governance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Owners retain read-only oversight. Profit allocations, debt levels, and repayment risk are visible here without operational mutation controls.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4" />
              Capital Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Monitor leverage via inter-account loans and overdue exposure, while the admin team executes day-to-day operations.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
