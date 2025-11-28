
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
import { addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { useCollection } from '@/firebase/firestore/use-collection';

const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  clientId: z.string({ required_error: 'Please select a client.' }),
  principal: z.coerce.number().positive({ message: 'Principal must be a positive number.' }),
  interestRate: z.coerce.number().min(0, { message: 'Interest rate cannot be negative.' }),
  duration: z.coerce.number().positive().int({ message: 'Duration must be a positive number of months.' }),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
});

type CreateDealFormProps = {
  onDealCreated: () => void;
};

type Client = {
  id: string;
  name: string;
  role: 'Client';
  email: string;
};

export function CreateDealForm({ onDealCreated }: CreateDealFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();

  const clientsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'Client'));
  }, [firestore]);

  const { data: clients, loading: clientsLoading } = useCollection<Client>(clientsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealName: '',
      principal: 10000,
      interestRate: 5,
      duration: 12,
      repaymentType: 'Equal Installments',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!firestore) {
      toast({ variant: "destructive", title: "Error", description: "Database not available." });
      setIsLoading(false);
      return;
    }

    const selectedClient = clients?.find(c => c.id === values.clientId);
    if (!selectedClient) {
      toast({ variant: "destructive", title: "Error", description: "Selected client not found." });
      setIsLoading(false);
      return;
    }

    try {
      const dealsCollection = collection(firestore, 'deals');
      await addDoc(dealsCollection, {
        ...values,
        clientName: selectedClient.name, // Denormalize client name
        status: 'Pending',
        createdAt: serverTimestamp(),
      });

      toast({
        title: 'Deal Created',
        description: `The deal "${values.dealName}" has been successfully created.`,
      });
      onDealCreated();
    } catch (error) {
      console.error('Deal Creation Error:', error);
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FirebaseError) {
        errorMessage = `An unexpected Firebase error occurred: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ variant: 'destructive', title: 'Deal Creation Failed', description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="dealName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deal Name</FormLabel>
              <FormControl><Input placeholder="e.g. Q3 Expansion Financing" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={clientsLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={clientsLoading ? "Loading clients..." : "Select a client"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clients?.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="principal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Principal Amount</FormLabel>
                  <FormControl><Input type="number" placeholder="10000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interestRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest Rate (%)</FormLabel>
                  <FormControl><Input type="number" placeholder="5" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (in months)</FormLabel>
              <FormControl><Input type="number" placeholder="12" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="repaymentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repayment Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select repayment type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Equal Installments">Equal Installments</SelectItem>
                  <SelectItem value="Balloon Payment">Balloon Payment</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading || clientsLoading}>
          {(isLoading || clientsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Deal
        </Button>
      </form>
    </Form>
  );
}
