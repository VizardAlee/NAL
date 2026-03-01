'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Crown, Landmark, PieChart, TrendingUp, Wallet, Banknote, Briefcase, Info, ArrowDownToLine, Loader2, LockKeyhole } from 'lucide-react';
import { Timestamp, collection, query, where, orderBy, limit, DocumentData, doc, addDoc } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

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
  partnerSnapshot: Array<{
    userId: string;
    displayName: string;
    allocatedAmount: number;
  }>;
};

type FundBatch = DocumentData & {
  id: string;
  sourceId: string;
  amount: number;
  remainingAmount: number;
  createdAt: Timestamp;
};

type Investment = DocumentData & {
  id: string;
  investorId: string;
  amount: number;
  dealId: string;
};

type WithdrawalQuarter = { label: string; startDate: string; endDate: string };

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value || 0);

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // local midnight, avoids UTC offset issue
}

function isDateInWindow(quarters: WithdrawalQuarter[]): { open: boolean; activeQuarter?: WithdrawalQuarter } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const q of quarters) {
    const start = parseLocalDate(q.startDate);
    const end = parseLocalDate(q.endDate);
    end.setHours(23, 59, 59, 999);
    if (today >= start && today <= end) {
      return { open: true, activeQuarter: q };
    }
  }
  return { open: false };
}

function WithdrawDialog({
  open,
  onClose,
  maxAmount,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  maxAmount: number;
  userId: string;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (!firestore) return;
    setIsPending(true);
    try {
      await addDoc(collection(firestore, 'withdrawalRequests'), {
        userId,
        amount: parsed,
        status: 'Pending',
        createdAt: Timestamp.now(),
        type: 'OwnerWithdrawal',
      });
      toast({ title: 'Withdrawal request submitted', description: 'Admin will review and process your request.' });
      setAmount('');
      onClose();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to submit request', variant: 'destructive' });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Withdrawal</DialogTitle>
          <DialogDescription>
            Enter the amount you wish to withdraw from your allocated profit. This will be reviewed by an admin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Amount (NGN)</label>
            <Input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50000"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Available: {formatCurrency(maxAmount)}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OwnerDashboardPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  // Platform Queries
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
    () => (firestore ? query(collection(firestore, 'ownerProfitAllocations'), orderBy('createdAt', 'desc'), limit(50)) : null),
    [firestore]
  );

  // Personal Queries
  const myFundBatchesQuery = useMemo(
    () => (firestore && user ? query(collection(firestore, 'fundBatches'), where('sourceId', '==', user.uid)) : null),
    [firestore, user]
  );
  const myInvestmentsQuery = useMemo(
    () => (firestore && user ? query(collection(firestore, 'investments'), where('investorId', '==', user.uid)) : null),
    [firestore, user]
  );

  // Withdrawal window
  const withdrawalWindowRef = useMemo(
    () => (firestore ? doc(firestore, 'platformSettings', 'ownerWithdrawalWindow') : null),
    [firestore]
  );
  const { data: withdrawalWindowData } = useDoc<{ quarters: WithdrawalQuarter[] }>(withdrawalWindowRef);

  const { data: users, loading: usersLoading } = useCollection<DocumentData>(usersQuery);
  const { data: deals, loading: dealsLoading } = useCollection<Deal>(dealsQuery);
  const { data: earnings, loading: earningsLoading } = useCollection<Transaction>(earningsQuery);
  const { data: pendingRepayments, loading: repaymentsLoading } = useCollection<Repayment>(pendingRepaymentsQuery);
  const { data: activeLoans, loading: loansLoading } = useCollection<Loan>(activeLoansQuery);
  const { data: ownerAllocations, loading: allocationsLoading } = useCollection<OwnerAllocation>(ownerAllocationsQuery);
  const { data: myFundBatches, loading: myBatchesLoading } = useCollection<FundBatch>(myFundBatchesQuery);
  const { data: myInvestments, loading: myInvestmentsLoading } = useCollection<Investment>(myInvestmentsQuery);

  const metrics = useMemo(() => {
    const platformEarnings = (earnings || []).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const activeDealsCount = (deals || []).filter((deal) => deal.status === 'Active').length;
    const totalUsers = (users || []).length;
    const adminDebtToPlatform = (activeLoans || []).reduce((sum, loan) => sum + (Number(loan.outstanding) || 0), 0);

    // Personal Metrics
    let personalTotalAllocated = 0;
    if (ownerAllocations && user) {
      ownerAllocations.forEach(alloc => {
        const myPart = alloc.partnerSnapshot?.find(p => p.userId === user.uid);
        if (myPart) personalTotalAllocated += (myPart.allocatedAmount || 0);
      });
    }

    const personalInvestible = (myFundBatches || []).reduce((sum, b) => sum + (b.remainingAmount || 0), 0);
    const personalInvested = (myInvestments || []).reduce((sum, i) => {
      const deal = deals?.find(d => d.id === i.dealId);
      if (deal?.status === 'Active') return sum + (i.amount || 0);
      return sum;
    }, 0);

    return {
      platformEarnings,
      activeDealsCount,
      totalUsers,
      adminDebtToPlatform,
      personalTotalAllocated,
      personalInvestible,
      personalInvested,
    };
  }, [earnings, deals, users, activeLoans, ownerAllocations, user, myFundBatches, myInvestments]);

  const isLoading = usersLoading || dealsLoading || earningsLoading || repaymentsLoading || loansLoading || allocationsLoading || myBatchesLoading || myInvestmentsLoading;

  const withdrawalStatus = useMemo(() => {
    if (!withdrawalWindowData?.quarters?.length) return { open: false };
    return isDateInWindow(withdrawalWindowData.quarters);
  }, [withdrawalWindowData]);

  // Find the next upcoming withdrawal window for the disabled button label
  const nextWindow = useMemo(() => {
    if (withdrawalStatus.open) return null;
    const today = new Date();
    const upcoming = (withdrawalWindowData?.quarters ?? [])
      .filter(q => new Date(q.startDate) > today)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return upcoming[0] ?? null;
  }, [withdrawalWindowData, withdrawalStatus]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Dashboard"
        description="Strategic oversight and personal ownership stake management."
        icon={Crown}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Personal Stake */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                My Ownership Stake
              </CardTitle>
              <CardDescription>Your share of the platform's distributed profits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Profit Allocated</p>
                <p className="text-2xl font-bold font-headline">{formatCurrency(metrics.personalTotalAllocated)}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Invested</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Briefcase className="h-3 w-3 text-primary" />
                    <span className="font-semibold">{formatCurrency(metrics.personalInvested)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Investible</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Banknote className="h-3 w-3 text-primary" />
                    <span className="font-semibold">{formatCurrency(metrics.personalInvestible)}</span>
                  </div>
                </div>
              </div>

              {/* Withdraw Button */}
              <div className="pt-2 border-t">
                {withdrawalStatus.open ? (
                  <div className="space-y-1.5">
                    <Button
                      className="w-full"
                      onClick={() => setWithdrawDialogOpen(true)}
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Withdraw Funds
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Window open: {withdrawalStatus.activeQuarter?.label}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Button className="w-full" disabled>
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      Withdrawals Closed
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      {nextWindow
                        ? `Next window: ${nextWindow.label} (${format(new Date(nextWindow.startDate), 'MMM d')} – ${format(new Date(nextWindow.endDate), 'MMM d, yyyy')})`
                        : 'No upcoming withdrawal windows scheduled.'}
                    </p>
                  </div>
                )}
              </div>

              <Alert className="mt-4 bg-background/50">
                <Info className="h-4 w-4" />
                <AlertTitle className="text-xs">Reinvestment Rule</AlertTitle>
                <AlertDescription className="text-[10px] leading-tight">
                  Allocated profits are automatically prioritized for new deals. Funds must contribute to the ecosystem before being realized as withdrawable earnings.
                </AlertDescription>
              </Alert>
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
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active deals</span>
                    <span className="font-semibold">{metrics.activeDealsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total users</span>
                    <span className="font-semibold">{metrics.totalUsers}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Platform Stats & Allocations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
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
                <CardTitle className="text-sm font-medium">Admin Debt to Platform</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.adminDebtToPlatform)}</div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Recent Profit Allocations
              </CardTitle>
              <CardDescription>
                Distributions from platform earnings into retained and owner portions.
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
                <p className="text-sm text-muted-foreground text-center py-8">No profit allocations recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {ownerAllocations.slice(0, 6).map((allocation) => (
                    <div key={allocation.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between text-sm">
                      <div>
                        <p className="font-medium">Total: {formatCurrency(allocation.sourceEarningAmount)}</p>
                        <p className="text-xs text-muted-foreground">
                          Retained: {formatCurrency(allocation.retainedAmount)} | Distributed: {formatCurrency(allocation.distributableAmount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{allocation.createdAt ? format(allocation.createdAt.toDate(), 'PPP') : 'Recently'}</p>
                        <Badge variant="outline" className="mt-1">Processed</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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

      {user && (
        <WithdrawDialog
          open={withdrawDialogOpen}
          onClose={() => setWithdrawDialogOpen(false)}
          maxAmount={metrics.personalTotalAllocated}
          userId={user.uid}
        />
      )}
    </div>
  );
}
