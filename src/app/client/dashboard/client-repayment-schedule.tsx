
'use client';

import { useMemo, useState, useEffect, useCallback, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HandCoins, CheckCircle, Hourglass, Loader2, Ban, Info, AlertTriangle } from 'lucide-react';
import { generateAmortizationSchedule, ScheduleInstallment } from '@/lib/amortization';
import { Deal, Repayment } from '@/lib/types';
import { format, isSameDay, startOfToday, isPast } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { useAuth, useUser } from '@/firebase';
import { lodgePaymentAction } from '@/app/client/dashboard/actions';
import { useToast } from '@/hooks/use-toast';
import { Timestamp } from 'firebase/firestore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { roundCurrency } from '@/lib/financial-integrity';

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Due' | 'Upcoming' | 'Cancelled';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  isActionable?: boolean;
  amountPaid: number;
  pendingAmount: number;
  amountRemaining: number;
  amountAvailableToLodge: number;
  paymentHistory: Repayment[];
  openingBalance: number;
}

function SubmitLodgePaymentButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
            Confirm Payment
        </Button>
    )
}

function LodgePaymentButton({ installment, dealId, userId, onPaymentLodged }: { installment: ScheduledPayment, dealId: string, userId: string, onPaymentLodged: (repayment: any) => void }) {
    const [state, formAction] = useActionState(lodgePaymentAction, { success: false, message: '', repayment: null });
    const { toast } = useToast();
    const auth = useAuth();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [amountToPay, setAmountToPay] = useState(installment.amountAvailableToLodge);
    const [authToken, setAuthToken] = useState('');

    useEffect(() => {
        if (state.message && state.success === false) {
             toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
        else if (state.success && state.repayment) {
            toast({
                title: 'Success',
                description: state.message,
            });
            const newRepayment = {
                ...state.repayment,
                lodgedAt: new Timestamp(state.repayment.lodgedAt._seconds, state.repayment.lodgedAt._nanoseconds),
                dueDate: new Timestamp(state.repayment.dueDate._seconds, state.repayment.dueDate._nanoseconds)
            };
            onPaymentLodged(newRepayment);
            setIsDialogOpen(false); // Close dialog on success
        }
    }, [state, toast, onPaymentLodged]);
    
    // Reset amount when dialog opens
    useEffect(() => {
        if(isDialogOpen) {
            setAmountToPay(installment.amountAvailableToLodge);
            auth?.currentUser?.getIdToken().then(setAuthToken).catch(() => setAuthToken(''));
        }
    }, [auth, isDialogOpen, installment.amountAvailableToLodge]);
    
    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="w-full">
                    <HandCoins className="mr-2 h-4 w-4" />
                    Lodge Payment
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Lodge a Payment</DialogTitle>
                    <DialogDescription>
                        Lodge a full or partial payment for installment #{installment.installment}.
                        Ensure you have made the payment to the platform's bank account first.
                    </DialogDescription>
                </DialogHeader>
                <form action={formAction} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount to Pay</Label>
                        <Input
                            id="amount"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={amountToPay}
                            onChange={(e) => setAmountToPay(parseFloat(e.target.value) || 0)}
                            max={roundCurrency(installment.amountAvailableToLodge)}
                            min="0.01"
                        />
                    </div>
                    <input type="hidden" name="dealId" value={dealId} />
                    <input type="hidden" name="authToken" value={authToken} />
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="dueDate" value={installment.dueDate.toISOString()} />
                    <input type="hidden" name="installmentNumber" value={installment.installment} />
                    <DialogFooter>
                         <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                        <SubmitLodgePaymentButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

function InstallmentDetailsDialog({ installment }: { installment: ScheduledPayment }) {
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Details for Installment #{installment.installment}</DialogTitle>
                <DialogDescription>Due on {format(installment.dueDate, 'PPP')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Due:</span> <span>{formatCurrency(installment.payment)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount Paid:</span> <span>{formatCurrency(installment.amountPaid)}</span></div>
                    {installment.pendingAmount > 0 && (
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Awaiting Approval:</span> <span>{formatCurrency(installment.pendingAmount)}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base"><span >Amount Remaining:</span> <span className="text-primary">{formatCurrency(installment.amountRemaining)}</span></div>
                </div>

                <h4 className="font-medium">Payment History for this Installment</h4>
                {installment.paymentHistory.length > 0 ? (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date Lodged</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {installment.paymentHistory.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell>{format(p.lodgedAt.toDate(), 'PPP')}</TableCell>
                                        <TableCell>{formatCurrency(p.amount)}</TableCell>
                                        <TableCell><Badge variant={p.status === 'Approved' ? 'default' : 'secondary'}>{p.status === 'Approved' ? 'Paid' : p.status}</Badge></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No payments lodged for this installment yet.</p>
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button>Close</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
    );
}

export function ClientRepaymentSchedule({ deal, initialRepayments, repaymentsLoading }: { deal: Deal, initialRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  const [allRepayments, setAllRepayments] = useState<Repayment[] | null>(initialRepayments);
  const [selectedInstallment, setSelectedInstallment] = useState<ScheduledPayment | null>(null);
  const isMobile = useIsMobile();
  
  useEffect(() => {
    setAllRepayments(initialRepayments);
  }, [initialRepayments]);

  const handlePaymentLodged = useCallback((newRepayment: Repayment) => {
    setAllRepayments(prev => {
        if (!prev) return [newRepayment];
        return [...prev, newRepayment];
    });
  }, []);
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];
    
    return schedule.map((installment, index) => {
      const openingBalance = index === 0 ? deal.principal : schedule[index - 1].balance;

      const relatedRepayments = allRepayments?.filter(r => 
          r.installmentNumber === installment.installment
      ) || [];

      const approvedAmountPaid = roundCurrency(relatedRepayments.filter(r => r.status === 'Approved').reduce((sum, r) => sum + r.amount, 0));
      const pendingAmount = roundCurrency(relatedRepayments.filter(r => r.status === 'Pending').reduce((sum, r) => sum + r.amount, 0));
      const amountRemaining = Math.max(0, roundCurrency(installment.payment - approvedAmountPaid));
      const amountAvailableToLodge = Math.max(0, roundCurrency(amountRemaining - pendingAmount));

      let status: RepaymentStatus = 'Upcoming';
      if (approvedAmountPaid >= installment.payment) {
          status = 'Paid';
      } else if (pendingAmount > 0) {
          status = 'Pending';
      } else if (approvedAmountPaid > 0) {
          status = 'Partially Paid';
      } else if (isPast(installment.dueDate)) {
          status = 'Due';
      }

      let isActionable = false;
      const firstActionableInstallment = schedule.find(inst => {
          const payments = allRepayments?.filter(r => r.installmentNumber === inst.installment) || [];
          const paid = roundCurrency(
            payments
              .filter((payment) => payment.status === 'Approved')
              .reduce((sum, payment) => sum + payment.amount, 0)
          ) >= inst.payment;
          return !paid;
      });

      if (firstActionableInstallment && firstActionableInstallment.installment === installment.installment) {
        isActionable = true;
      }
      
      return {
        ...installment,
        status,
        isActionable,
        amountPaid: approvedAmountPaid,
        pendingAmount,
        amountRemaining,
        amountAvailableToLodge,
        paymentHistory: relatedRepayments,
        openingBalance,
      };
    });
  }, [schedule, allRepayments, deal.principal]);
  
  const paginatedSchedule = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return enhancedSchedule.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [enhancedSchedule, currentPage]);

  const totalPages = Math.ceil(enhancedSchedule.length / ITEMS_PER_PAGE);

  const StatusBadge = ({ status }: { status: RepaymentStatus }) => {
    const variantMap: { [key in RepaymentStatus]: 'default' | 'secondary' | 'outline' | 'destructive' } = {
      Paid: 'default',
      'Partially Paid': 'outline',
      Pending: 'outline',
      Upcoming: 'secondary',
      Due: 'destructive',
      Cancelled: 'secondary'
    };
    const IconMap: { [key in RepaymentStatus]: React.ElementType } = {
        Paid: CheckCircle,
        'Partially Paid': Hourglass,
        Pending: Hourglass,
        Upcoming: Hourglass,
        Due: AlertTriangle,
        Cancelled: Ban
    }
    const Icon = IconMap[status];

    return <Badge variant={variantMap[status]} className="flex items-center gap-1.5"><Icon className="h-3 w-3" /> {status}</Badge>;
  };


  if (repaymentsLoading) {
      return (
          <div className="p-4">
              <Skeleton className="h-40 w-full" />
          </div>
      )
  }

  if (deal.status !== 'Active') {
      return (
          <div className="p-6 text-sm text-muted-foreground text-center">
              {deal.status === 'Terminated' ? 'This deal has been terminated.' : 'Repayment schedule will be available once the deal is active.'}
          </div>
      )
  }

  if (schedule.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        A repayment schedule could not be generated for this deal.
      </div>
    );
  }

  if (paginatedSchedule.length === 0) {
     return (
      <div className="p-6 text-sm text-muted-foreground text-center">
        No payments found in this view.
      </div>
    );
  }

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedInstallment(null)}>
        <div className="flex flex-col h-full">
            <div className="p-4 pt-2 flex-grow">
                {isMobile ? (
                    <div className="space-y-3">
                        {paginatedSchedule.map(item => (
                            <DialogTrigger key={`${item.installment}-${item.status}`} asChild>
                                <Card onClick={() => setSelectedInstallment(item)} className={item.isActionable ? 'border-primary' : ''}>
                                    <CardContent className="p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold">{formatCurrency(item.payment)}</p>
                                                <p className="text-xs text-muted-foreground">Due: {format(item.dueDate, 'PPP')}</p>
                                            </div>
                                            <StatusBadge status={item.status} />
                                        </div>
                                        <div className="text-xs space-y-1 pt-2 border-t">
                                            <div className="flex justify-between"><span className="text-muted-foreground">Principal Repayment:</span> <span>{formatCurrency(item.principal)}</span></div>
                                            <div className="flex justify-between"><span className="text-muted-foreground">Profit Payment:</span> <span>{formatCurrency(item.interest)}</span></div>
                                            <div className="flex justify-between"><span className="text-muted-foreground">Closing Balance:</span> <span>{formatCurrency(item.balance)}</span></div>
                                        </div>
                                        {(item.isActionable && item.status !== 'Paid' && item.status !== 'Pending' && user) && (
                                            <div className="pt-3 border-t">
                                                <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} onPaymentLodged={handlePaymentLodged} />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </DialogTrigger>
                        ))}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>S/N</TableHead>
                                <TableHead>Installment Date</TableHead>
                                <TableHead>Opening Balance</TableHead>
                                <TableHead>Principal Repayment</TableHead>
                                <TableHead>Profit Payment</TableHead>
                                <TableHead>Periodic Installment</TableHead>
                                <TableHead>Closing Balance</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {paginatedSchedule.map(item => (
                             <DialogTrigger key={`${item.installment}-${item.status}`} asChild>
                                <TableRow onClick={() => setSelectedInstallment(item)} className={`cursor-pointer ${item.isActionable ? 'bg-muted/50' : ''}`}>
                                    <TableCell>{item.installment}</TableCell>
                                    <TableCell>{format(item.dueDate, 'PPP')}</TableCell>
                                    <TableCell>{formatCurrency(item.openingBalance)}</TableCell>
                                    <TableCell>{formatCurrency(item.principal)}</TableCell>
                                    <TableCell>{formatCurrency(item.interest)}</TableCell>
                                    <TableCell className="font-medium">{formatCurrency(item.payment)}</TableCell>
                                    <TableCell>{formatCurrency(item.balance)}</TableCell>
                                    <TableCell><StatusBadge status={item.status} /></TableCell>
                                    <TableCell className="text-right w-40">
                                    {(item.isActionable && item.status !== 'Paid' && item.status !== 'Pending' && user) && (
                                        <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} onPaymentLodged={handlePaymentLodged} />
                                    )}
                                    </TableCell>
                                </TableRow>
                            </DialogTrigger>
                        ))}
                        </TableBody>
                    </Table>
                )}
            </div>
            {totalPages > 1 && (
                <div className="p-4 border-t">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1))}} aria-disabled={currentPage === 1}/>
                            </PaginationItem>
                            {[...Array(totalPages)].map((_, i) => (
                                <PaginationItem key={i}>
                                    <PaginationLink href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(i + 1)}} isActive={currentPage === i+1}>{i+1}</PaginationLink>
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1))}} aria-disabled={currentPage === totalPages} />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
        {selectedInstallment && <InstallmentDetailsDialog installment={selectedInstallment} />}
    </Dialog>
  );
}
