
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Repayment } from './page';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, Hourglass } from 'lucide-react';

type RepaymentHistoryProps = {
  repayments: Repayment[] | null;
  loading: boolean;
};

export function RepaymentHistory({ repayments, loading }: RepaymentHistoryProps) {
    
    const sortedRepayments = repayments
        ? [...repayments].sort((a, b) => b.lodgedAt.toMillis() - a.lodgedAt.toMillis())
        : [];

    const StatusBadge = ({ status }: { status: 'Pending' | 'Approved' | 'Rejected' }) => {
        const isApproved = status === 'Approved';
        return (
            <Badge variant={isApproved ? 'default' : 'secondary'} className="flex items-center gap-1.5">
                {isApproved ? <CheckCircle className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
                {status}
            </Badge>
        );
    };

    if (loading) {
        return (
             <div className="p-4">
                <Skeleton className="h-20 w-full" />
            </div>
        );
    }
    
    if (!sortedRepayments || sortedRepayments.length === 0) {
        return (
            <div className="p-6 text-center text-sm text-muted-foreground">
                No repayments have been lodged for this deal yet.
            </div>
        );
    }

    return (
        <div className="p-4">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Date Lodged</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {sortedRepayments.map((repayment) => (
                    <TableRow key={repayment.id}>
                    <TableCell data-label="Date Lodged">{format(repayment.lodgedAt.toDate(), 'PPP')}</TableCell>
                    <TableCell data-label="Amount" className="font-medium">
                        {new Intl.NumberFormat('en-NG', {
                        style: 'currency',
                        currency: 'NGN',
                        }).format(repayment.amount)}
                    </TableCell>
                    <TableCell data-label="Status">
                        <StatusBadge status={repayment.status as any} />
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
    );
}
