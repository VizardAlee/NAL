
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFormStatus, useActionState } from 'react-dom';
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

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Pending' | 'Due' | 'Upcoming';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  repaymentDoc?: Repayment;
  isActionable?: boolean;
}

function LodgePaymentButton({ installment, dealId, userId }: { installment: ScheduledPayment, dealId: string, userId: string }) {
    const initialState = { success: false, message: '' };
    const [state, formAction] = useActionState(lodgePaymentAction, initialState);
    const { pending } = useFormStatus();
    const { toast } = useToast();

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? 'Success' : 'Error',
                description: state.message,
                variant: state.success ? 'default' : 'destructive',
            });
        }
    }, [state, toast]);
    
    return (
        <form action={formAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="amount" value={installment.payment} />
            <input type="hidden" name="userId" value={userId} />
            <Button size="sm" type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                Lodge Payment
            </Button>
        </form>
    );
}

// The LodgePaymentButton must be wrapped in a component that can use useActionState
// This wrapper provides the form context.
function LodgePaymentFormWrapper({ installment, dealId, userId }: { installment: ScheduledPayment, dealId: string, userId: string }) {
    // Note: useActionState and useFormStatus need to be used within a form.
    // So we'll have the button component manage its own form state.
    return (
        <LodgePaymentButton installment={installment} dealId={dealId} userId={userId} />
    )
}

export function RepaymentSchedule({ deal, allRepayments, repaymentsLoading }: { deal: Deal, allRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { user } = useUser();
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];

    const today = startOfToday();
    
    // Create a map for quick lookup of approved repayments by due date string
    const approvedRepayments = new Map<string, Repayment>();
    allRepayments?.forEach(repayment => {
        if (repayment.status === 'Approved') {
            const dueDateStr = format(repayment.lodgedAt.toDate(), 'yyyy-MM-dd');
            approvedRepayments.set(dueDateStr, repayment);
        }
    });

    return schedule.map(installment => {
        const installmentDueDateStr = format(installment.dueDate, 'yyyy-MM-dd');
        
        const matchingRepayment = allRepayments?.find(r => 
            isSameDay(r.lodgedAt.toDate(), installment.dueDate)
        );

        let status: RepaymentStatus = 'Upcoming';
        if (matchingRepayment) {
            status = matchingRepayment.status === 'Approved' ? 'Paid' : 'Pending';
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
                            <LodgePaymentFormWrapper installment={item} dealId={deal.id} userId={user.uid} />
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
