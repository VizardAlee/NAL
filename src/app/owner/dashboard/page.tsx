'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Crown, Landmark, TrendingUp, Wallet, Banknote, Briefcase, Info, ArrowDownToLine, Loader2, LockKeyhole, History, Users2, Percent, Scale, AlertTriangle, RefreshCw, HandCoins, ShieldAlert, Activity } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { requestWithdrawalAction } from '@/app/investor/dashboard/withdrawal-actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { loadOwnerDashboardAction, type OwnerDashboardSnapshot } from './actions';

type WithdrawalQuarter = { label: string; startDate: string; endDate: string };

const ITEMS_PER_PAGE = 5;

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
  userName,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  maxAmount: number;
  userId: string;
  userName: string;
  onSubmitted: () => void;
}) {
  const auth = useAuth();
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
    if (parsed > maxAmount) {
      toast({ title: 'Insufficient funds', description: 'Amount exceeds your withdrawable liquid profit balance.', variant: 'destructive' });
      return;
    }
    setIsPending(true);
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return;
      }
      const authToken = await currentUser.getIdToken();
      const formData = new FormData();
      formData.set('authToken', authToken);
      formData.set('amount', String(parsed));
      formData.set('userId', userId);
      formData.set('userName', userName);

      const result = await requestWithdrawalAction(null, formData);

      if (result.success) {
        toast({ title: 'Withdrawal request submitted', description: result.message });
        setAmount('');
        onClose();
        onSubmitted();
      } else {
        console.error("Withdrawal Request Server Error:", result);
        toast({
          variant: 'destructive',
          title: 'Request Failed',
          description: result.message || 'An error occurred. Check the console for details.'
        });
      }
    } catch (err) {
      console.error("Withdrawal Request Exception:", err);
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
            Enter the amount you wish to withdraw from your allocated profit. Only liquid (uninvested) funds can be withdrawn.
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
              Max Withdrawable (Liquid): {formatCurrency(maxAmount)}
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
  const { user } = useUser();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [snapshot, setSnapshot] = useState<OwnerDashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    user.getIdToken().then((authToken) => loadOwnerDashboardAction({ authToken })).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setSnapshot(null);
        setLoadError(result.message);
      } else {
        setSnapshot(result.data);
      }
    }).catch(() => {
      if (!cancelled) {
        setSnapshot(null);
        setLoadError('The owner accounting service could not be reached. No financial values are being displayed.');
      }
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, refreshKey]);

  const metrics = snapshot?.metrics;
  const ownerPolicy = snapshot?.policy;
  const ownerAllocations = useMemo(() => snapshot?.allocations ?? [], [snapshot]);
  const myWithdrawals = useMemo(() => snapshot?.withdrawals ?? [], [snapshot]);
  const withdrawalWindowData = snapshot?.withdrawalWindow;

  const withdrawalStatus = useMemo(() => {
    if (!withdrawalWindowData?.quarters?.length) return { open: false };
    return isDateInWindow(withdrawalWindowData.quarters);
  }, [withdrawalWindowData]);

  const nextWindow = useMemo(() => {
    if (withdrawalStatus.open) return null;
    const today = new Date();
    const upcoming = (withdrawalWindowData?.quarters ?? [])
      .filter(q => parseLocalDate(q.startDate) > today)
      .sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime());
    return upcoming[0] ?? null;
  }, [withdrawalWindowData, withdrawalStatus]);

  const paginatedWithdrawals = useMemo(() => {
    const start = (withdrawalPage - 1) * ITEMS_PER_PAGE;
    return myWithdrawals.slice(start, start + ITEMS_PER_PAGE);
  }, [myWithdrawals, withdrawalPage]);

  const withdrawalTotalPages = useMemo(() => {
    return Math.ceil(myWithdrawals.length / ITEMS_PER_PAGE);
  }, [myWithdrawals]);

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Owner Dashboard" description="Strategic oversight and personal ownership stake management." icon={Crown} />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Financial dashboard unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{loadError}</p>
            <p>No balance has been replaced with a zero or estimated value.</p>
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Retry securely</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!metrics || !ownerPolicy) {
    return (
      <div className="space-y-6">
        <PageHeader title="Owner Dashboard" description="Loading verified owner accounting records." icon={Crown} />
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
      </div>
    );
  }

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
          <Card className="border-primary bg-primary/5 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                My Ownership Stake
              </CardTitle>
              <CardDescription>Your share of distributed profits based on equity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Share Units</p>
                  <p className="text-lg font-bold">{(metrics.myShareUnits || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Equity %</p>
                  <div className="flex items-center gap-1">
                    <Percent className="h-3 w-3 text-primary" />
                    <p className="text-lg font-bold">{metrics.mySharePercent.toFixed(2)}%</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Available Profit Balance (Liquid)</p>
                <p className="text-3xl font-bold font-headline">{formatCurrency(metrics.withdrawableLiquidProfit)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-muted-foreground">Total Unwithdrawn: {formatCurrency(metrics.personalUnwithdrawnProfit)}</p>
                  {metrics.personalInvested > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-destructive/30 text-destructive h-4 flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> Invested Lock
                    </Badge>
                  )}
                </div>
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
                  <p className="text-xs text-muted-foreground">Investible (Cash)</p>
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
                      disabled={metrics.withdrawableLiquidProfit <= 0}
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
                <AlertTitle className="text-xs">Reinvestment & Withdrawal Rule</AlertTitle>
                <AlertDescription className="text-[10px] leading-tight">
                  Invested funds are locked until the associated deal is completed. Only liquid profit (not active in deals) is available for withdrawal during open windows.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Split Policy</CardTitle>
              <CardDescription>Current earnings distribution rule.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-12 w-full" /> : (
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                  <div className="text-center flex-1 border-r">
                    <p className="text-[10px] uppercase text-muted-foreground">Retained</p>
                    <p className="text-xl font-bold text-primary">{ownerPolicy.retainedPercent}%</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] uppercase text-muted-foreground">Shared</p>
                    <p className="text-xl font-bold text-accent-foreground">{ownerPolicy.distributablePercent}%</p>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Platform Earnings are split between <strong>Retained Earnings</strong> (reinvested into platform operations) and <strong>Shared Profits</strong> (allocated to owners based on equity).
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Platform Stats & Allocations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Allocated Gross Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.grossPlatformEarnings)}</div>}
                <p className="text-[10px] text-muted-foreground mt-1">Verified gross earnings already processed through the owner split</p>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-primary" />
                  Equity Pool (Shared)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold text-primary">{formatCurrency(metrics.globalTotalDistributed)}</div>}
                <p className="text-[10px] text-muted-foreground mt-1">Total shared among all owners</p>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  Retained Earnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatCurrency(metrics.globalTotalRetained)}</div>}
                <p className="text-[10px] text-muted-foreground mt-1">Platform operational share</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  My Withdrawal History
                </CardTitle>
                <CardDescription>Status of your recent withdrawal requests.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> :
                !myWithdrawals || myWithdrawals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No withdrawal requests found.</p> : (
                  <>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedWithdrawals.map((req) => (
                            <TableRow key={req.id}>
                              <TableCell className="text-xs">{format(new Date(req.requestedAt), 'PP')}</TableCell>
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
                    {withdrawalTotalPages > 1 && (
                      <div className="mt-4">
                        <Pagination>
                          <PaginationContent className="flex-wrap">
                            <PaginationItem>
                              <PaginationPrevious
                                href="#"
                                onClick={(e) => { e.preventDefault(); setWithdrawalPage(p => Math.max(1, p - 1)) }}
                                aria-disabled={withdrawalPage === 1}
                              />
                            </PaginationItem>
                            {[...Array(withdrawalTotalPages)].map((_, i) => (
                              <PaginationItem key={i}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => { e.preventDefault(); setWithdrawalPage(i + 1); }}
                                  isActive={withdrawalPage === i + 1}
                                >
                                  {i + 1}
                                </PaginationLink>
                              </PaginationItem>
                            ))}
                            <PaginationItem>
                              <PaginationNext
                                href="#"
                                onClick={(e) => { e.preventDefault(); setWithdrawalPage(p => Math.min(withdrawalTotalPages, p + 1)) }}
                                aria-disabled={withdrawalPage === withdrawalTotalPages}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </>
                )
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Recent Split Audits
              </CardTitle>
              <CardDescription>
                Verification of exact percentage splits for recent earnings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : ownerAllocations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No profit allocations recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {ownerAllocations.slice(0, 6).map((allocation) => (
                    <div key={allocation.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between text-sm">
                      <div>
                        <p className="font-medium">Gross: {formatCurrency(allocation.sourceEarningAmount)}</p>
                        <p className="text-xs text-muted-foreground">
                          Retained: {formatCurrency(allocation.retainedAmount)} ({allocation.retainedPercent}%) | Distributed: {formatCurrency(allocation.distributableAmount)} ({allocation.distributablePercent}%)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{allocation.createdAt ? format(new Date(allocation.createdAt), 'PPP') : 'Recently'}</p>
                        <Badge variant="outline" className="mt-1">Verified</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Activity className="h-4 w-4" />Active operations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.activeDealsCount}</p>
            <p className="text-xs text-muted-foreground">Active deals · {metrics.totalUsers} platform users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><HandCoins className="h-4 w-4" />Pending repayments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(metrics.pendingRepaymentAmount)}</p>
            <p className="text-xs text-muted-foreground">{metrics.pendingRepaymentCount} payment request(s) awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4" />Overdue exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(metrics.overdueExposure)}</p>
            <p className="text-xs text-muted-foreground">{metrics.overdueCaseCount} overdue or broken-promise case(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Landmark className="h-4 w-4" />Inter-account leverage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(metrics.adminDebtToPlatform)}</p>
            <p className="text-xs text-muted-foreground">Outstanding active inter-account loans</p>
          </CardContent>
        </Card>
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

      <p className="text-right text-xs text-muted-foreground">Verified snapshot generated {format(new Date(snapshot.generatedAt), 'PPpp')}</p>

      {user && (
        <WithdrawDialog
          open={withdrawDialogOpen}
          onClose={() => setWithdrawDialogOpen(false)}
          maxAmount={metrics.withdrawableLiquidProfit}
          userId={user.uid}
          userName={user.displayName || user.email || 'Owner'}
          onSubmitted={refresh}
        />
      )}
    </div>
  );
}
