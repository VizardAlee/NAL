
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { collection, query, where, serverTimestamp, writeBatch, getDocs, doc, runTransaction } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { useCollection } from '@/firebase/firestore/use-collection';

const formSchema = z.object({
  investorId: z.string({ required_error: 'Please select an investor.' }),
  amount: z.coerce.number().positive({ message: 'Investment amount must be a positive number.' }),
});

type AddInvestmentFormProps = {
  dealId: string;
  dealName: string;
  onInvestmentAdded: () => void;
};

type Investor = {
  id: string;
  name: string;
  role: 'Investor';
};

export function AddInvestmentForm({ dealId, dealName, onInvestmentAdded }: AddInvestmentFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();

  const investorsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'Investor'));
  }, [firestore]);

  const { data: investors, loading: investorsLoading } = useCollection<Investor>(investorsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore) {
      toast({ variant: "destructive", title: "Error", description: "Database not available." });
      setIsLoading(false);
      return;
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const investorId = values.investorId;
        let amountToInvest = values.amount;

        // Find the investor's fund batches
        const fundBatchesQuery = query(
          collection(firestore, 'fundBatches'),
          where('sourceId', '==', investorId),
          where('remainingAmount', '>', 0)
        );
        const fundBatchesSnapshot = await getDocs(fundBatchesQuery);

        const availableFunds = fundBatchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().remainingAmount, 0);

        if (availableFunds < amountToInvest) {
          throw new Error('Investor has insufficient funds.');
        }

        const batch = writeBatch(firestore);
        const timestamp = serverTimestamp();

        // Deduct from fund batches
        for (const batchDoc of fundBatchesSnapshot.docs) {
          if (amountToInvest <= 0) break;
          const batchData = batchDoc.data();
          const amountToDeduct = Math.min(amountToInvest, batchData.remainingAmount);
          
          batch.update(batchDoc.ref, {
            remainingAmount: batchData.remainingAmount - amountToDeduct
          });

          amountToInvest -= amountToDeduct;
        }

        // Create the investment record
        const investmentRef = doc(collection(firestore, 'investments'));
        batch.set(investmentRef, {
            investorId: investorId,
            dealId: dealId,
            amount: values.amount,
            createdAt: timestamp
        });
        
        // Create the transaction log for the investment
        const transactionRef = doc(collection(firestore, 'transactions'));
        batch.set(transactionRef, {
            userId: investorId,
            dealId: dealId,
            type: 'Investment',
            amount: -values.amount, // Investment is a debit from investor's perspective
            createdAt: timestamp,
            dealName: dealName, // denormalized for easy display
        });
        
        await batch.commit();
      });

      toast({
        title: 'Investment Successful',
        description: `Successfully invested in "${dealName}".`,
      });
      onInvestmentAdded();
      form.reset();

    } catch (error) {
      console.error('Investment Error:', error);
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FirebaseError) {
        errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ variant: 'destructive', title: 'Investment Failed', description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="investorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Investor</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={investorsLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={investorsLoading ? "Loading..." : "Select an investor"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {investors?.map(investor => (
                    <SelectItem key={investor.id} value={investor.id}>{investor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Investment Amount</FormLabel>
              <FormControl>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
                    <Input type="number" placeholder="10000" className="pl-8" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading || investorsLoading}>
          {(isLoading || investorsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Invest
        </Button>
      </form>
    </Form>
  );
}
