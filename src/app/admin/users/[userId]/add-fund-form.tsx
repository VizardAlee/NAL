
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { doc, collection, writeBatch, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const formSchema = z.object({
  amount: z.coerce.number().positive({ message: 'Amount must be a positive number.' }),
  tenureValue: z.coerce.number().positive().int({ message: 'Tenure must be a positive number.' }),
  tenureUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  createdAt: z.date().optional(),
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
      tenureValue: 12,
      tenureUnit: 'Months',
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
      const batch = writeBatch(firestore);
      const timestamp = values.createdAt ? Timestamp.fromDate(values.createdAt) : Timestamp.now();

      const fundBatchRef = doc(collection(firestore, 'fundBatches'));
      batch.set(fundBatchRef, {
        sourceId: userId,
        amount: values.amount,
        remainingAmount: values.amount,
        tenureValue: values.tenureValue,
        tenureUnit: values.tenureUnit,
        createdAt: timestamp,
      });

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
      // Note: We won't close the dialog here, let the user close it manually.
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="tenureValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tenure</FormLabel>
                <FormControl><Input type="number" placeholder="12" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tenureUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>&nbsp;</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Days">Days</SelectItem>
                    <SelectItem value="Weeks">Weeks</SelectItem>
                    <SelectItem value="Fortnights">Fortnights</SelectItem>
                    <SelectItem value="Months">Months</SelectItem>
                    <SelectItem value="Years">Years</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="createdAt"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Deposit Date (Optional)</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    selectable={true}
                    headerToolbar={{ left: 'prev', center: 'title', right: 'next' }}
                    dateClick={(arg: any) => {
                      form.setValue('createdAt', arg.date);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>
                Leave blank to use the current date.
              </FormDescription>
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
