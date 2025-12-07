

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
import { Repayment } from '@/lib/types';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, Hourglass } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';

type RepaymentHistoryProps = {
  repayments: Repayment[] | null;
  loading: boolean;
};

export function RepaymentHistory({ repayments, loading }: RepaymentHistoryProps) {
    const isMobile = useIsMobile();
    
    const sortedRepayments = repayments
        ? [...repayments].sort((a, b) => b.lodgedAt.toMillis() - a.lodgedAt.toMillis())
        : [];

    const StatusBadge = ({ status }: { status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' }) => {
        const isApproved = status === 'Approved';
        const variant = isApproved ? 'default' : (status === 'Rejected' || status === 'Cancelled') ? 'destructive' : 'secondary';
        const Icon = isApproved ? CheckCircle : Hourglass;

        return (
            <Badge variant={variant} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {status}
            </Badge>
        );
    };

    if (loading) {
        return (
             <div className="p-4 space-y-3">
                <Skeleton className="h-20 w-full" />
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
            {isMobile ? (
                <div className="space-y-3">
                    {sortedRepayments.map((repayment) => (
                        <Card key={repayment.id}>
                            <CardContent className="p-4 flex justify-between items-start">
                                <div>
                                    <p className="font-medium">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(repayment.amount)}</p>
                                    <p className="text-xs text-muted-foreground">Lodged: {format(repayment.lodgedAt.toDate(), 'PPP')}</p>
                                </div>
                                <StatusBadge status={repayment.status} />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
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
                            <StatusBadge status={repayment.status} />
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
