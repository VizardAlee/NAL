
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp, writeBatch, doc, getDocs, query, where } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { notifyAdmins } from '@/app/common/actions/notification-actions';

type WithdrawFormProps = {
  portfolioValue: number;
  onWithdrawalRequested: () => void;
};

// This server action should be in a separate file, but for simplicity here.
async function requestWithdrawalAction(userId: string, userName: string, amount: number) {
    'use server';
    try {
        const firestore = (await import('@/firebase/admin-app')).adminDb;
        
        await firestore.collection('withdrawalRequests').add({
            investorId: userId,
            investorName: userName,
            amount,
            status: 'Pending',
            requestedAt: serverTimestamp(),
        });
        
        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Withdrawal Request',
            `${userName} requested a withdrawal of ${formattedAmount}.`,
            '/admin/approvals/withdrawals'
        );
        
        return { success: true, message: `Your request to withdraw ${formattedAmount} has been submitted.` };
    } catch(error) {
        return { success: false, message: "Failed to submit withdrawal request." };
    }
}


export function WithdrawForm({ portfolioValue, onWithdrawalRequested }: WithdrawFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { user } = useUser();

  const formSchema = z.object({
    amount: z.coerce
      .number()
      .positive({ message: 'Amount must be a positive number.' })
      .max(portfolioValue, { message: 'Withdrawal amount cannot exceed your withdrawable balance.' }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: Math.min(10000, portfolioValue),
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    
    if (!user || !user.displayName) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }
    
    startTransition(async () => {
        const result = await requestWithdrawalAction(user.uid, user.displayName!, values.amount);
        if (result.success) {
            toast({
                title: 'Withdrawal Request Submitted',
                description: result.message,
            });
            onWithdrawalRequested();
        } else {
             toast({
                variant: 'destructive',
                title: 'Request Failed',
                description: result.message,
            });
        }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount to Withdraw</FormLabel>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
                  <Input type="number" placeholder="10000" className="pl-8" {...field} />
                </div>
              </FormControl>
              <FormDescription>
                Max available for withdrawal: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(portfolioValue)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending || portfolioValue <= 0}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Request Withdrawal
        </Button>
      </form>
    </Form>
  );
}
