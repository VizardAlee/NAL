
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormState } from 'react-hook-form';
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
import { useEffect, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useUser } from '@/firebase';
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

function SubmitButton({ balance }: { balance: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || balance <= 0}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Request Withdrawal
    </Button>
  );
}

export function WithdrawForm({ withdrawableBalance, onWithdrawalRequested }: WithdrawFormProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [state, formAction] = useActionState(requestWithdrawalAction, { success: false, message: '' });

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
    if (state.message) {
      if (state.success) {
        toast({
          title: 'Withdrawal Request Submitted',
          description: state.message,
        });
        onWithdrawalRequested();
      } else {
        toast({
          variant: 'destructive',
          title: 'Request Failed',
          description: state.message,
        });
      }
    }
  }, [state, toast, onWithdrawalRequested]);

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-4 pt-4">
        <input type="hidden" name="userId" value={user?.uid || ''} />
        <input type="hidden" name="userName" value={user?.displayName || ''} />
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
                Max available for withdrawal: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(withdrawableBalance)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton balance={withdrawableBalance} />
      </form>
    </Form>
  );
}
