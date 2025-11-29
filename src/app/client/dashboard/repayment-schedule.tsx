
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
import { HandCoins, CheckCircle, Hourglass, Loader2 } from 'lucide-react';
import { generateAmortizationSchedule, ScheduleInstallment } from '@/lib/amortization';
import { Deal } from '@/lib/types';
import { Repayment } from './page';
import { format, isSameDay, startOfToday } from 'date-fns';
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
import { lodgePaymentAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Timestamp } from 'firebase/firestore';

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Pending' | 'Due' | 'Upcoming';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  repaymentDoc?: Repayment;
  isActionable?: boolean;
}

function LodgePaymentButton({ installment, dealId, userId, onPaymentLodged }: { installment: ScheduledPayment, dealId: string, userId: string, onPaymentLodged: (repayment: any) => void }) {
    const initialState = { success: false, message: '', repayment: null };
    const [state, formAction] = useActionState(lodgePaymentAction, initialState);
    const { pending } = useFormStatus();
    const { toast } = useToast();

    useEffect(() => {
        if (state.message) {
            if (state.success) {
                toast({
                    title: 'Success',
                    description: state.message,
                });
                if (state.repayment) {
                    const newRepayment = {
                        ...state.repayment,
                        lodgedAt: new Timestamp(state.repayment.lodgedAt._seconds, state.repayment.lodgedAt._nanoseconds),
                        dueDate: new Timestamp(state.repayment.dueDate._seconds, state.repayment.dueDate._nanoseconds)
                    };
                    onPaymentLodged(newRepayment);
                }
            } else {
                toast({
                    title: 'Error',
                    description: state.message,
                    variant: 'destructive',
                });
            }
        }
    }, [state, toast, onPaymentLodged]);
    
    return (
        <form action={formAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="amount" value={installment.payment} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="dueDate" value={installment.dueDate.toISOString()} />
            <Button size="sm" type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                Lodge Payment
            </Button>
        </form>
    );
}

export function RepaymentSchedule({ deal, initialRepayments, repaymentsLoading }: { deal: Deal, initialRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  const [allRepayments, setAllRepayments] = useState<Repayment[] | null>(initialRepayments);
  
  useEffect(() => {
    setAllRepayments(initialRepayments);
  }, [initialRepayments]);

  const handlePaymentLodged = useCallback((newRepayment: Repayment) => {
    setAllRepayments(prev => {
        if (!prev) return [newRepayment];

        // Find and replace by dealId + dueDate (most reliable)
        const index = prev.findIndex(r =>
        r.dealId === newRepayment.dealId &&
        r.dueDate && newRepayment.dueDate &&
        r.dueDate.toMillis() === newRepayment.dueDate.toMillis()
        );

        if (index !== -1) {
        const updated = [...prev];
        updated[index] = newRepayment;
        return updated;
        }

        // If not found, add it. This handles the initial load case.
        return [...prev, newRepayment];
    });
  }, []);
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];
    const today = startOfToday();

    return schedule.map(installment => {
      // Find any repayment (pending or approved) for the same day.
      const matchingRepayment = allRepayments?.find(r => {
          if (!r.dueDate) return false;
          return isSameDay(r.dueDate.toDate(), installment.dueDate);
      });

      let status: RepaymentStatus = 'Upcoming';
      if (matchingRepayment) {
        status = matchingRepayment.status === 'Approved' ? 'Paid' : 'Pending';
      } else if (installment.dueDate < today) {
        status = 'Due';
      }

      return { ...installment, status, repaymentDoc: matchingRepayment };
    });
  }, [schedule, allRepayments]);

  // Find the next payable installment and create the final list
  const finalSchedule = useMemo(() => {
    const nextPayableInstallmentIndex = enhancedSchedule.findIndex(
      p => p.status === 'Due' || p.status === 'Upcoming'
    );
    
    return enhancedSchedule.map((installment, index) => ({
      ...installment,
      // Only the very next non-paid/non-pending installment is actionable.
      isActionable: index === nextPayableInstallmentIndex,
      // The Lodge button should be disabled if the payment is already made or pending.
      isButtonDisabled: installment.status === 'Paid' || installment.status === 'Pending'
    })).sort((a, b) => {
        // Custom sort: bring the single actionable item to the top
        if (a.isActionable && !b.isActionable) return -1;
        if (!a.isActionable && b.isActionable) return 1;
        // Then sort by installment number for all other items
        return a.installment - b.installment;
    });
  }, [enhancedSchedule]);

  const paginatedSchedule = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return finalSchedule.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [finalSchedule, currentPage]);

  const totalPages = Math.ceil(finalSchedule.length / ITEMS_PER_PAGE);

  const StatusBadge = ({ status }: { status: RepaymentStatus }) => {
    const variantMap: { [key in RepaymentStatus]: 'default' | 'secondary' | 'outline' | 'destructive' } = {
      Paid: 'default',
      Pending: 'outline',
      Upcoming: 'secondary',
      Due: 'destructive',
    };
    const IconMap: { [key in RepaymentStatus]: React.ElementType } = {
        Paid: CheckCircle,
        Pending: Hourglass,
        Upcoming: Hourglass,
        Due: HandCoins,
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
          <div className="px-6 pb-4 text-sm text-muted-foreground">
              Repayment schedule will be available once the deal is active.
          </div>
      )
  }

  if (schedule.length === 0) {
    return (
      <div className="px-6 pb-4 text-sm text-muted-foreground">
        This deal is a Balloon Payment type and does not have a detailed installment schedule.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
        <div className="p-6 pt-2 flex-grow">
            <h4 className="text-sm font-semibold mb-2">Repayment Schedule</h4>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Due</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Profit</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {paginatedSchedule.map(item => (
                    <TableRow key={`${item.installment}-${item.status}`} className={item.isActionable ? 'bg-muted/50' : ''}>
                        <TableCell>{format(item.dueDate, 'PPP')}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.principal)}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.interest)}</TableCell>
                        <TableCell className="font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.payment)}</TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell className="text-right">
                        {(item.isActionable && !item.isButtonDisabled && user) && (
                            <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} onPaymentLodged={handlePaymentLodged} />
                        )}
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
        {totalPages > 1 && (
            <div className="p-4 border-t">
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1))}} disabled={currentPage === 1}/>
                        </PaginationItem>
                        {[...Array(totalPages)].map((_, i) => (
                             <PaginationItem key={i}>
                                <PaginationLink href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(i + 1)}} isActive={currentPage === i+1}>{i+1}</PaginationLink>
                             </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1))}} disabled={currentPage === totalPages} />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        )}
    </div>
  );
}
