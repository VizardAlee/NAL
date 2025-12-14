
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
import { Badge } from '@/components/ui/badge';
import { HandCoins, CheckCircle, Hourglass, Ban, AlertTriangle } from 'lucide-react';
import { generateAmortizationSchedule, ScheduleInstallment } from '@/lib/amortization';
import { Deal, Repayment } from '@/lib/types';
import { format, isPast } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { InstallmentDetailsDialog } from './installment-details-dialog';

const ITEMS_PER_PAGE = 5;

type RepaymentStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Due' | 'Upcoming' | 'Cancelled';

interface ScheduledPayment extends ScheduleInstallment {
  status: RepaymentStatus;
  amountPaid: number;
  amountRemaining: number;
  paymentHistory: Repayment[];
  openingBalance: number;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

export function RepaymentSchedule({ deal, initialRepayments, repaymentsLoading }: { deal: Deal, initialRepayments: Repayment[] | null, repaymentsLoading: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInstallment, setSelectedInstallment] = useState<ScheduledPayment | null>(null);
  const isMobile = useIsMobile();
  
  const schedule = useMemo(() => generateAmortizationSchedule(deal), [deal]);
  
  const enhancedSchedule = useMemo((): ScheduledPayment[] => {
    if (!schedule) return [];
    
    return schedule.map((installment, index) => {
      const openingBalance = index === 0 ? deal.principal : schedule[index - 1].balance;
        
      const relatedRepayments = initialRepayments?.filter(r => 
          r.installmentNumber === installment.installment
      ) || [];

      const approvedAmountPaid = relatedRepayments.filter(r => r.status === 'Approved').reduce((sum, r) => sum + r.amount, 0);
      const pendingAmount = relatedRepayments.filter(r => r.status === 'Pending').reduce((sum, r) => sum + r.amount, 0);
      const totalAmountPaid = approvedAmountPaid + pendingAmount;
      const amountRemaining = Math.max(0, installment.payment - totalAmountPaid);

      let status: RepaymentStatus = 'Upcoming';
      if (amountRemaining <= 0.01) { // Tolerance for float precision
          status = 'Paid';
      } else if (pendingAmount > 0) {
          status = 'Pending';
      } else if (approvedAmountPaid > 0) {
          status = 'Partially Paid';
      } else if (isPast(installment.dueDate)) {
          status = 'Due';
      }
      
      return { ...installment, status, amountPaid: totalAmountPaid, amountRemaining, paymentHistory: relatedRepayments, openingBalance };
    });
  }, [schedule, initialRepayments, deal.principal]);
  

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

  if (deal.status !== 'Active' && deal.status !== 'Completed' && deal.status !== 'Terminated') {
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
    <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedInstallment(null)}>
        <div className="flex flex-col h-full">
            <div className="p-4 pt-2 flex-grow">
                {isMobile ? (
                    <div className="space-y-3">
                        {paginatedSchedule.map(item => (
                            <DialogTrigger key={`${item.installment}-${item.status}`} asChild>
                                <Card onClick={() => setSelectedInstallment(item)}>
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
                                            <div className="flex justify-between pt-1 border-t mt-1"><span className="text-muted-foreground">Remaining:</span> <span className="font-bold text-primary">{formatCurrency(item.amountRemaining)}</span></div>
                                        </div>
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {paginatedSchedule.map(item => (
                            <DialogTrigger key={`${item.installment}-${item.status}`} asChild>
                                <TableRow onClick={() => setSelectedInstallment(item)} className="cursor-pointer">
                                    <TableCell>{item.installment}</TableCell>
                                    <TableCell>{format(item.dueDate, 'PPP')}</TableCell>
                                    <TableCell>{formatCurrency(item.openingBalance)}</TableCell>
                                    <TableCell>{formatCurrency(item.principal)}</TableCell>
                                    <TableCell>{formatCurrency(item.interest)}</TableCell>
                                    <TableCell className="font-medium">{formatCurrency(item.payment)}</TableCell>
                                    <TableCell>{formatCurrency(item.balance)}</TableCell>
                                    <TableCell><StatusBadge status={item.status} /></TableCell>
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
