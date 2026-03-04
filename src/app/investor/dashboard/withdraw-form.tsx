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
import { useEffect, useActionState, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { requestWithdrawalAction } from './withdrawal-actions';

type WithdrawFormProps = {
  withdrawableBalance: number;
  onWithdrawalRequested: () => void;
};

const formSchema = z.object({
  amount: z.coerce
    .number()
    .positive({ message: 'Amount must be a positive number.' })
    .min(1, { message: 'Withdrawal amount must be greater than zero.' }),
});

export function WithdrawForm({ withdrawableBalance, onWithdrawalRequested }: WithdrawFormProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const auth = useAuth();
  const [state, action, isPending] = useActionState(requestWithdrawalAction, { success: false, message: '' });
  const [toastShown, setToastShown] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema.refine(data => data.amount <= withdrawableBalance, {
      message: 'Withdrawal amount cannot exceed your withdrawable balance.',
      path: ['amount'],
    })),
    defaultValues: {
      amount: Math.min(10000, withdrawableBalance),
    },
  });

  useEffect(() => {
    if (state.message && !toastShown) {
      if (state.success) {
        toast({
          title: 'Withdrawal Request Submitted',
          description: state.message,
        });
        onWithdrawalRequested();
      } else {
        console.error("Withdrawal Request Failed.");
        toast({
          variant: 'destructive',
          title: 'Request Failed',
          description: state.message || 'An error occurred. Check the console for details.',
        });
      }
      setToastShown(true);
    }
  }, [state, toast, onWithdrawalRequested, toastShown]);

  // Reset toastShown when a new submission starts (isPending becomes true)
  useEffect(() => {
    if (isPending) {
      setToastShown(false);
    }
  }, [isPending]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    const currentUser = auth?.currentUser;
    if (!currentUser) {
      toast({
        variant: 'destructive',
        title: 'Request Failed',
        description: 'You must be logged in.',
      });
      return;
    }

    const authToken = await currentUser.getIdToken();
    const formData = new FormData();
    formData.append('authToken', authToken);
    formData.append('amount', values.amount.toString());
    formData.append('userId', user?.uid || '');
    formData.append('userName', user?.displayName || user?.email || 'Investor');

    // Call the server action provided by useActionState
    action(formData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount to Withdraw</FormLabel>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
                  <Input type="number" placeholder="10000" className="pl-8" {...field} disabled={isPending} />
                </div>
              </FormControl>
              <FormDescription>
                Max available for withdrawal: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(withdrawableBalance)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending || withdrawableBalance <= 0}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? 'Submitting...' : 'Request Withdrawal'}
        </Button>
      </form>
    </Form>
  );
}
