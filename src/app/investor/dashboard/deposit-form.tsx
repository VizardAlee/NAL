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
import { useUser } from '@/firebase';
import { requestDepositAction } from './deposit-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

type DepositFormProps = {
  onDepositRequested: () => void;
};

const formSchema = z.object({
  amount: z.coerce
    .number()
    .positive({ message: 'Amount must be a positive number.' })
    .min(1000, { message: 'Minimum deposit is ₦1,000.' }),
});


export function DepositForm({ onDepositRequested }: DepositFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { user } = useUser();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 50000,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !user.displayName) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }

    startTransition(async () => {
        const result = await requestDepositAction({ amount: values.amount, userId: user.uid, userName: user.displayName! });

        if (result.success) {
            toast({
                title: 'Deposit Request Submitted',
                description: result.message,
            });
            onDepositRequested();
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
    <div className="space-y-6">
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>How this works</AlertTitle>
            <AlertDescription>
                Submit a deposit request and an admin will contact you for further engagement. Your account will be credited upon confirmation.
            </AlertDescription>
        </Alert>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Amount to Deposit</FormLabel>
                <FormControl>
                    <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
                    <Input type="number" placeholder="50000" className="pl-8" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Deposit Request
            </Button>
        </form>
        </Form>
    </div>
  );
}