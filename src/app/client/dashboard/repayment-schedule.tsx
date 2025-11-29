
'use client';

import { useMemo, useState, useEffect } from 'react';
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
import { useActionState } from 'react';
import { lodgePaymentAction } from './actions';
import { useToast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Pending' | 'Due' | 'Upcoming';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  repaymentDoc?: Repayment;
}

function LodgePaymentButton({ installment, dealId, userId }: { installment: ScheduledPayment, dealId: string, userId: string }) {
    const initialState = { success: false, message: '' };
    const [state, formAction] = useActionState(lodgePaymentAction, initialState);
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? 'Success' : 'Error',
                description: state.message,
                variant: state.success ? 'default' : 'destructive',
            });
        }
        setIsPending(false);
    }, [state, toast]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsPending(true);
        const formData = new FormData(e.currentTarget);
        formAction(formData);
    }
    
    return (
        <form onSubmit={handleSubmit}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="amount" value={installment.payment} />
            <input type="hidden" name="userId" value={userId} />
            <Button size="sm" type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                Lodge Payment
            </Button>
        </form>
    );
}

export function RepaymentSchedule({ deal, allRepayments, repaymentsLoading }: { deal: Deal, allRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];

    const today = startOfToday();
    const paidInstallmentNumbers = new Set<number>();

    // First pass: find all paid installments
    allRepayments?.forEach(repayment => {
        const matchingInstallment = schedule.find(inst => 
            isSameDay(repayment.lodgedAt.toDate(), inst.dueDate) && 
            Math.abs(repayment.amount - inst.payment) < 0.01 // Compare floats
        );
        if (matchingInstallment) {
            paidInstallmentNumbers.add(matchingInstallment.installment);
        }
    });

    return schedule.map(installment => {
        let status: RepaymentStatus = 'Upcoming';
        const isPaid = paidInstallmentNumbers.has(installment.installment);

        if (isPaid) {
            const matchingRepayment = allRepayments!.find(r => isSameDay(r.lodgedAt.toDate(), installment.dueDate));
            status = matchingRepayment?.status === 'Approved' ? 'Paid' : 'Pending';
        } else if (installment.dueDate < today) {
            status = 'Due';
        }

        return { ...installment, status };
    });
  }, [schedule, allRepayments]);

  // Find the next payable installment and create the final list
  const finalSchedule = useMemo(() => {
    const nextPayableInstallmentIndex = enhancedSchedule.findIndex(
      p => p.status === 'Due' || p.status === 'Upcoming'
    );
    
    return enhancedSchedule.map((installment, index) => ({
      ...installment,
      isActionable: index === nextPayableInstallmentIndex
    })).sort((a, b) => {
        // Custom sort: bring the single actionable item to the top
        if (a.isActionable && !b.isActionable) return -1;
        if (!a.isActionable && b.isActionable) return 1;
        // Then sort by installment number
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
                    <TableRow key={item.installment} className={item.isActionable ? 'bg-muted/50' : ''}>
                        <TableCell>{format(item.dueDate, 'PPP')}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.principal)}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.interest)}</TableCell>
                        <TableCell className="font-bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.payment)}</TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell className="text-right">
                        {(item.isActionable && user) && (
                            <LodgePaymentButton installment={item} dealId={deal.id} userId={user.uid} />
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
