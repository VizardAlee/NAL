
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
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { FirebaseError } from 'firebase/app';

type WithdrawFormProps = {
  portfolioValue: number;
  onWithdrawalRequested: () => void;
};

export function WithdrawForm({ portfolioValue, onWithdrawalRequested }: WithdrawFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();
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
    setIsLoading(true);
    if (!firestore || !user) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      setIsLoading(false);
      return;
    }

    try {
      const batch = writeBatch(firestore);

      const withdrawalRequestsCollection = collection(firestore, 'withdrawalRequests');
      const withdrawalRef = doc(withdrawalRequestsCollection);
      batch.set(withdrawalRef, {
        investorId: user.uid,
        investorName: user.displayName || 'Unknown Investor',
        amount: values.amount,
        status: 'Pending',
        requestedAt: serverTimestamp(),
      });

      const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(values.amount);
      const notificationRef = doc(collection(firestore, 'notifications'));
      batch.set(notificationRef, {
          title: "Withdrawal Request",
          message: `${user.displayName || 'An investor'} requested a withdrawal of ${formattedAmount}.`,
          link: "/admin/approvals/withdrawals",
          read: false,
          createdAt: serverTimestamp()
      });

      await batch.commit();


      toast({
        title: 'Withdrawal Request Submitted',
        description: `Your request to withdraw ${formattedAmount} has been submitted for approval.`,
      });
      onWithdrawalRequested();
    } catch (error) {
      console.error('Withdrawal Request Error:', error);
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FirebaseError) {
        errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ variant: 'destructive', title: 'Request Failed', description: errorMessage });
    } finally {
      setIsLoading(false);
    }
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
        <Button type="submit" className="w-full" disabled={isLoading || portfolioValue <= 0}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Request Withdrawal
        </Button>
      </form>
    </Form>
  );
}
