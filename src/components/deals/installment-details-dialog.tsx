

'use client';

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScheduleInstallment } from '@/lib/amortization';
import { Repayment } from '@/lib/types';
import { format } from 'date-fns';
import { useIsMobile } from "@/hooks/use-mobile";


const formatCurrency = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

interface ScheduledPayment extends ScheduleInstallment {
  amountPaid: number;
  amountRemaining: number;
  paymentHistory: Repayment[];
}

export function InstallmentDetailsDialog({ installment }: { installment: ScheduledPayment }) {
    const isMobile = useIsMobile();
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
                    <div className="flex justify-between font-bold text-base"><span >Amount Remaining:</span> <span className="text-primary">{formatCurrency(installment.amountRemaining)}</span></div>
                </div>

                <h4 className="font-medium">Payment History for this Installment</h4>
                {installment.paymentHistory.length > 0 ? (
                    isMobile ? (
                        <div className="space-y-2">
                            {installment.paymentHistory.map(p => (
                                <Card key={p.id}>
                                    <CardContent className="p-3 flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">{formatCurrency(p.amount)}</p>
                                            <p className="text-xs text-muted-foreground">{format(p.lodgedAt.toDate(), 'PPP')}</p>
                                        </div>
                                        <Badge variant={p.status === 'Approved' ? 'default' : p.status === 'Rejected' ? 'destructive' : 'secondary'}>{p.status}</Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
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
                                            <TableCell><Badge variant={p.status === 'Approved' ? 'default' : p.status === 'Rejected' ? 'destructive' : 'secondary'}>{p.status}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )
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
