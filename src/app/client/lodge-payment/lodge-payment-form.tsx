
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
import { addDoc, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent } from '@/components/ui/card';
import { Deal } from '@/lib/types';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
  dealId: z.string({ required_error: 'Please select a deal.' }),
  amount: z.coerce.number().positive({ message: 'Amount must be a positive number.' }),
});


export function LodgePaymentForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const activeDealsQuery = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'deals'), where('clientId', '==', user.uid), where('status', '==', 'Active'));
  }, [firestore, user]);

  const { data: activeDeals, loading: dealsLoading } = useCollection<Deal>(activeDealsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {},
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore || !user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to lodge a payment." });
      setIsLoading(false);
      return;
    }

    try {
      const repaymentsCollection = collection(firestore, 'repayments');
      await addDoc(repaymentsCollection, {
        dealId: values.dealId,
        clientId: user.uid,
        amount: values.amount,
        status: 'Pending',
        lodgedAt: Timestamp.now(),
      });

      toast({
        title: 'Payment Lodged',
        description: `Your payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(values.amount)} has been submitted for approval.`,
      });
      router.push('/client/dashboard');
    } catch (error) {
      console.error('Lodge Payment Error:', error);
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FirebaseError) {
        errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ variant: 'destructive', title: 'Payment Failed', description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }

  const isSubmitting = isLoading || userLoading || dealsLoading;

  return (
    <Card>
        <CardContent className="p-6">
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                control={form.control}
                name="dealId"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Select Deal</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={dealsLoading}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={dealsLoading ? "Loading your deals..." : "Select an active deal"} />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        {activeDeals?.map(deal => (
                            <SelectItem key={deal.id} value={deal.id}>{deal.dealName}</SelectItem>
                        ))}
                        {activeDeals?.length === 0 && !dealsLoading && <p className="p-4 text-sm text-muted-foreground">You have no active deals.</p>}
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
                        <FormLabel>Amount</FormLabel>
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
                
                <Button type="submit" className="w-full" disabled={isSubmitting || !activeDeals?.length}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for Approval
                </Button>
            </form>
            </Form>
        </CardContent>
    </Card>
  );
}
