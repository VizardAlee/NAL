
'use client';

import { useMemo, useState } from 'react';
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
import { HandCoins, CheckCircle, Hourglass } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { generateAmortizationSchedule, ScheduleInstallment } from '@/lib/amortization';
import { Deal } from '@/lib/types';
import { Repayment } from './page';
import { format, isSameDay, startOfToday } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

const ITEMS_PER_PAGE = 10;

type RepaymentStatus = 'Paid' | 'Pending' | 'Due' | 'Upcoming';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  repaymentDoc?: Repayment;
}

export function RepaymentSchedule({ deal, allRepayments, repaymentsLoading }: { deal: Deal, allRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];

    const today = startOfToday();
    const processedInstallments = new Set<number>();

    return schedule.map(installment => {
        let status: RepaymentStatus = 'Upcoming';
        // Find if a repayment was lodged for this specific installment
        // This is a simplification. A real system would need a more robust way
        // to link a repayment to a specific installment, perhaps by saving the
        // installment number or due date with the repayment document.
        const matchingRepayment = allRepayments?.find(r => 
            isSameDay(r.lodgedAt.toDate(), installment.dueDate) || // Lodged on the due date
            (r.lodgedAt.toDate() < installment.dueDate && !processedInstallments.has(installment.installment))
        );

        if (matchingRepayment) {
            processedInstallments.add(installment.installment);
            if (matchingRepayment.status === 'Approved') {
                status = 'Paid';
            } else {
                status = 'Pending';
            }
        } else if (installment.dueDate < today) {
            status = 'Due';
        }

        return { ...installment, status };
    }).sort((a, b) => {
        // Sort by due date ascending
        return a.dueDate.getTime() - b.dueDate.getTime();
    }).sort((a, b) => {
        // Bring the first 'Due' or 'Upcoming' to the top
        const isADue = a.status === 'Due' || a.status === 'Upcoming';
        const isBDue = b.status === 'Due' || b.status === 'Upcoming';
        if (isADue && !isBDue) return -1;
        if (!isADue && isBDue) return 1;
        return 0;
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
                    <TableHead>Due Date</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Profit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {paginatedSchedule.map(item => (
                    <TableRow key={item.installment}>
                        <TableCell>{format(item.dueDate, 'PPP')}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.principal)}</TableCell>
                        <TableCell>{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(item.interest)}</TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell className="text-right">
                        {item.status === 'Due' && (
                            <Button size="sm" onClick={() => router.push('/client/lodge-payment')}>
                                Lodge Payment
                            </Button>
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
                        {Array.from({length: totalPages}).map((_, i) => (
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
