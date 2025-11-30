
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
import { HandCoins, CheckCircle, Hourglass, Loader2, Ban } from 'lucide-react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Pending' | 'Due' | 'Upcoming' | 'Cancelled';

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
            if (state.success && state.repayment) {
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
            } else if (!state.success) {
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
  const isMobile = useIsMobile();
  
  useEffect(() => {
    setAllRepayments(initialRepayments);
  }, [initialRepayments]);

  const handlePaymentLodged = useCallback((newRepayment: Repayment) => {
    setAllRepayments(prev => {
        if (!prev) return [newRepayment];

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

        return [...prev, newRepayment];
    });
  }, []);
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];
    const today = startOfToday();

    return schedule.map(installment => {
      const matchingRepayment = allRepayments?.find(r => {
          if (!r.dueDate) return false;
          return isSameDay(r.dueDate.toDate(), installment.dueDate);
      });

      let status: RepaymentStatus = 'Upcoming';
      if (matchingRepayment) {
        status = matchingRepayment.status === 'Approved' ? 'Paid' 
                : matchingRepayment.status === 'Cancelled' ? 'Cancelled'
                : 'Pending';
      } else if (installment.dueDate < today) {
        status = 'Due';
      }

      return { ...installment, status, repaymentDoc: matchingRepayment };
    });
  }, [schedule, allRepayments]);
  
  const upcomingSchedule = useMemo(() => {
      return enhancedSchedule.filter(p => p.status === 'Due' || p.status === 'Upcoming');
  }, [enhancedSchedule]);

  const finalSchedule = useMemo(() => {
    const nextPayableInstallmentIndex = upcomingSchedule.findIndex(
      p => p.status === 'Due' || p.status === 'Upcoming'
    );
    
    return upcomingSchedule.map((installment, index) => ({
      ...installment,
      isActionable: index === nextPayableInstallmentIndex,
    })).sort((a, b) => {
        if (a.isActionable && !b.isActionable) return -1;
        if (!a.isActionable && b.isActionable) return 1;
        return a.installment - b.installment;
    });
  }, [upcomingSchedule]);

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
      Cancelled: 'secondary'
    };
    const IconMap: { [key in RepaymentStatus]: React.ElementType } = {
        Paid: CheckCircle,
        Pending: Hourglass,
        Upcoming: Hourglass,
        Due: HandCoins,
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
        No upcoming payments due.
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
                                        <p className="font-bold">{formatCurrency(item.payment)}</p>
                                        <p className="text-xs text-muted-foreground">Due: {format(item.dueDate, 'PPP')}</p>
                                    </div>
                                    <StatusBadge status={item.status} />
                                </div>
                                <div className="text-xs space-y-1 pt-2 border-t">
                                    <div className="flex justify-between"><span className="text-muted-foreground">Principal:</span> <span>{formatCurrency(item.principal)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Markup:</span> <span>{formatCurrency(item.interest)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Balance:</span> <span>{formatCurrency(item.balance)}</span></div>
                                </div>
                                {(item.isActionable && user) && (
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
                        <TableHead>Due</TableHead>
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
                            <TableCell data-label="Due">{format(item.dueDate, 'PPP')}</TableCell>
                            <TableCell data-label="Principal">{formatCurrency(item.principal)}</TableCell>
                            <TableCell data-label="Markup">{formatCurrency(item.interest)}</TableCell>
                            <TableCell data-label="Total Payment" className="font-bold">{formatCurrency(item.payment)}</TableCell>
                            <TableCell data-label="Balance">{formatCurrency(item.balance)}</TableCell>
                            <TableCell data-label="Status"><StatusBadge status={item.status} /></TableCell>
                            <TableCell data-label="Action" className="text-right">
                            {(item.isActionable && user) && (
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
