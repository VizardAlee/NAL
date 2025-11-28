
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { Naira } from '@/components/icons';

const formSchema = z.object({
  amount: z.coerce.number().positive({ message: 'Amount must be a positive number.' }),
});

type AddFundFormProps = {
  userId: string;
};

export function AddFundForm({ userId }: AddFundFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 50000,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore) {
      toast({ variant: "destructive", title: "Error", description: "Database not available." });
      setIsLoading(false);
      return;
    }

    try {
      // Use a batch to ensure both writes succeed or fail together
      const batch = writeBatch(firestore);
      const timestamp = serverTimestamp();

      // 1. Create new fund batch
      const fundBatchRef = doc(collection(firestore, 'fundBatches'));
      batch.set(fundBatchRef, {
        sourceId: userId,
        amount: values.amount,
        remainingAmount: values.amount,
        createdAt: timestamp,
      });

      // 2. Create corresponding transaction log
      const transactionRef = doc(collection(firestore, 'transactions'));
      batch.set(transactionRef, {
          userId: userId,
          type: 'Deposit',
          amount: values.amount,
          createdAt: timestamp,
      });

      await batch.commit();

      toast({
        title: 'Funds Added',
        description: `${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(values.amount)} added to investor's account.`,
      });
      form.reset();
    } catch (error) {
      console.error('Add Fund Error:', error);
      let errorMessage = 'An unknown error occurred while adding funds.';
      if (error instanceof FirebaseError) {
        errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ variant: 'destructive', title: 'Failed to Add Funds', description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount to Deposit</FormLabel>
              <FormControl>
                <div className="relative">
                    <Naira className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="number" placeholder="50000" className="pl-8" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Deposit Funds
        </Button>
      </form>
    </Form>
  );
}
