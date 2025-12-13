
'use client';

import { useMemo, useState, useEffect, useCallback, useActionState, useRef } from 'react';
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
import { useUser } from '@/firebase';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Due' | 'Upcoming' | 'Cancelled';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  isActionable?: boolean;
  amountPaid: number;
  amountRemaining: number;
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
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [amountToPay, setAmountToPay] = useState(installment.amountRemaining);

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
            setAmountToPay(installment.amountRemaining);
        }
    }, [isDialogOpen, installment.amountRemaining]);
    
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
                            value={amountToPay}
                            onChange={(e) => setAmountToPay(parseFloat(e.target.value) || 0)}
                            max={installment.amountRemaining}
                            min={1}
                        />
                    </div>
                    <input type="hidden" name="dealId" value={dealId} />
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

export function ClientRepaymentSchedule({ deal, initialRepayments, repaymentsLoading }: { deal: Deal, initialRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  const [allRepayments, setAllRepayments] = useState<Repayment[] | null>(initialRepayments);
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
    const today = startOfToday();
    
    let firstActionableFound = false;
    return schedule.map(installment => {
      const relatedRepayments = allRepayments?.filter(r => 
          r.installmentNumber === installment.installment
      ) || [];

      const approvedAmountPaid = relatedRepayments.filter(r => r.status === 'Approved').reduce((sum, r) => sum + r.amount, 0);
      const pendingAmount = relatedRepayments.filter(r => r.status === 'Pending').reduce((sum, r) => sum + r.amount, 0);
      const totalAmountPaid = approvedAmountPaid + pendingAmount;
      const amountRemaining = Math.max(0, installment.payment - totalAmountPaid);

      let status: RepaymentStatus = 'Upcoming';
      if (totalAmountPaid >= installment.payment) {
          status = 'Paid';
      } else if (pendingAmount > 0) {
          status = 'Pending';
      } else if (totalAmountPaid > 0) {
          status = 'Partially Paid';
      } else if (isPast(installment.dueDate)) {
          status = 'Due';
      }

      let isActionable = false;
      if (!firstActionableFound && (status === 'Due' || status === 'Upcoming' || status === 'Partially Paid')) {
        isActionable = true;
        firstActionableFound = true;
      }
      
      return { ...installment, status, isActionable, amountPaid: totalAmountPaid, amountRemaining };
    });
  }, [schedule, allRepayments]);
  
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

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

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
        This deal is a Balloon Payment type and does not have a detailed installment schedule.
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
    <div className="flex flex-col h-full">
        <div className="p-4 pt-2 flex-grow">
            {isMobile ? (
                <div className="space-y-3">
                    {paginatedSchedule.map(item => (
                        <Card key={`${item.installment}-${item.status}`} className={item.isActionable ? 'border-primary' : ''}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold">{formatCurrency(item.payment)}</p>
                                            <Popover>
                                                <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-5 w-5"><Info className="h-3 w-3 text-muted-foreground" /></Button></PopoverTrigger>
                                                <PopoverContent className="text-xs space-y-1 w-56">
                                                     <div className="flex justify-between"><span>Total Due:</span> <span className="font-medium">{formatCurrency(item.payment)}</span></div>
                                                    <div className="flex justify-between"><span>Paid:</span> <span className="font-medium">{formatCurrency(item.amountPaid)}</span></div>
                                                    <div className="flex justify-between font-bold"><span>Remaining:</span> <span>{formatCurrency(item.amountRemaining)}</span></div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Due: {format(item.dueDate, 'PPP')}</p>
                                    </div>
                                    <StatusBadge status={item.status} />
                                </div>
                                <div className="text-xs space-y-1 pt-2 border-t">
                                    <div className="flex justify-between"><span className="text-muted-foreground">Principal:</span> <span>{formatCurrency(item.principal)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Markup:</span> <span>{formatCurrency(item.interest)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Balance:</span> <span>{formatCurrency(item.balance)}</span></div>
                                </div>
                                {(item.isActionable && item.status !== 'Paid' && user) && (
                                    <div className="pt-3 border-t">
                                        <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} onPaymentLodged={handlePaymentLodged} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Markup</TableHead>
                        <TableHead>Total Payment</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedSchedule.map(item => (
                        <TableRow key={`${item.installment}-${item.status}`} className={item.isActionable ? 'bg-muted/50' : ''}>
                            <TableCell data-label="Due Date">{format(item.dueDate, 'PPP')}</TableCell>
                            <TableCell data-label="Principal">{formatCurrency(item.principal)}</TableCell>
                            <TableCell data-label="Markup">{formatCurrency(item.interest)}</TableCell>
                            <TableCell data-label="Total Payment" className="font-bold">
                                <div className="flex items-center gap-2">
                                    <span>{formatCurrency(item.payment)}</span>
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger>
                                        <PopoverContent className="text-sm space-y-1 w-56">
                                            <div className="flex justify-between"><span>Total Due:</span> <span className="font-medium">{formatCurrency(item.payment)}</span></div>
                                            <div className="flex justify-between"><span>Paid:</span> <span className="font-medium">{formatCurrency(item.amountPaid)}</span></div>
                                            <div className="flex justify-between font-bold"><span>Remaining:</span> <span>{formatCurrency(item.amountRemaining)}</span></div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </TableCell>
                            <TableCell data-label="Balance">{formatCurrency(item.balance)}</TableCell>
                            <TableCell data-label="Status"><StatusBadge status={item.status} /></TableCell>
                            <TableCell data-label="Action" className="text-right w-40">
                            {(item.isActionable && item.status !== 'Paid' && user) && (
                                <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} onPaymentLodged={handlePaymentLodged} />
                            )}
                            </TableCell>
                        </TableRow>
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
  );
}

