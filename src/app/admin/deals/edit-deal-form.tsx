
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo, useTransition, useEffect } from 'react';
import { CalendarIcon, Loader2, BookOpen } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { FirebaseError } from 'firebase/app';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Deal } from '@/lib/types';
import { updateDealAction } from './actions';
import { isDurationShort } from '@/lib/duration-helpers';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import Link from 'next/link';


const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  clientId: z.string({ required_error: 'Please select a client.' }),
  principal: z.coerce.number().positive({ message: 'Principal must be a positive number.' }),
  profitRate: z.coerce.number().min(0, { message: 'Profit rate cannot be negative.' }),
  managementFeeRate: z.coerce.number().min(0, { message: 'Management fee rate cannot be negative.' }),
  financingMode: z.enum(['Murabaha', 'Ijara']).optional().default('Murabaha'),
  durationValue: z.coerce.number().positive().int({ message: 'Duration must be a positive number.' }),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  startDate: z.date().optional(),
});

type EditDealFormProps = {
  deal: Deal;
  onDealUpdated: () => void;
};

type Client = {
  id: string;
  name: string;
  role: 'Client';
  email: string;
};

export function EditDealForm({ deal, onDealUpdated }: EditDealFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const firestore = useFirestore();

  const clientsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', '==', 'Client'));
  }, [firestore]);

  const { data: clients, loading: clientsLoading } = useCollection<Client>(clientsQuery);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...deal,
      financingMode: deal.financingMode || 'Murabaha',
      managementFeeRate: deal.managementFeeRate || 0,
      startDate: deal.startDate?.toDate(),
    },
  });

  const durationValue = form.watch('durationValue');
  const durationUnit = form.watch('durationUnit');
  const isShortDeal = isDurationShort(durationValue, durationUnit);

  useEffect(() => {
    if (!isShortDeal && form.getValues('repaymentType') === 'Balloon Payment') {
      form.setValue('repaymentType', 'Equal Installments');
    }
  }, [isShortDeal, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    startTransition(async () => {
      const selectedClient = clients?.find(c => c.id === values.clientId);
      if (!selectedClient) {
        toast({ variant: "destructive", title: "Error", description: "Selected client not found." });
        return;
      }

      const result = await updateDealAction(deal.id, selectedClient.name, values);

      if (result.success) {
        toast({
          title: 'Deal Updated',
          description: result.message,
        });
        onDealUpdated();
      } else {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: result.message,
        });
      }
    });
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
        <FormField
          control={form.control}
          name="financingMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Financing Mode</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Murabaha">Murabaha (Cost-Plus)</SelectItem>
                  <SelectItem value="Ijara">Ijara (Leasing)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className="flex items-center gap-1 text-xs">
                <BookOpen className="h-3 w-3" />
                <Link href="/admin/financing-modes" target="_blank" className="hover:underline">Learn about these modes</Link>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            name="profitRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profit Rate (%)</FormLabel>
                <FormControl><Input type="number" placeholder="5" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="managementFeeRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Management Fee Rate (%)</FormLabel>
              <FormControl><Input type="number" step="0.1" placeholder="2" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="durationValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration</FormLabel>
                <FormControl><Input type="number" placeholder="12" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="durationUnit"
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
          name="repaymentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repayment Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select repayment type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Equal Installments">Equal Installments</SelectItem>
                  {isShortDeal && <SelectItem value="Balloon Payment">Balloon Payment</SelectItem>}
                </SelectContent>
              </Select>
              <FormDescription>Balloon Payment is only available for deals 3 months or shorter.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="repaymentFrequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repayment Frequency</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select repayment frequency" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Deal Start Date</FormLabel>
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
                        <span>Pick a start date</span>
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
                      form.setValue('startDate', arg.date);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>
                The official start of the loan term.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending || clientsLoading}>
          {(isPending || clientsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </form>
    </Form>
  );
}
