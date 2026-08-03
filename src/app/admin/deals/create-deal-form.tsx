
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { GuarantorPhotoField } from '@/components/guarantor-photo-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';
import { CalendarIcon, Loader2, BookOpen } from 'lucide-react';
import { collection, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import Link from 'next/link';
import { hasPersona, type LegacyRole, type Persona } from '@/lib/access-control';
import { createDealAction } from './actions';
import { getRequiredIdToken } from '@/firebase/auth-token';

type CallableError = Error & {
  code?: string;
  details?: unknown;
  customData?: unknown;
};

function getDealCreationErrorMessage(error: unknown) {
  const callableError = error as CallableError;
  if (
    callableError.message?.includes('Unauthorized: invalid auth token') ||
    callableError.message?.includes('Unauthorized: missing auth token')
  ) {
    return 'Your session is no longer valid. Please sign out, sign in again, and retry creating the deal.';
  }

  const details = callableError.details || callableError.customData;
  const parts = [
    callableError.code ? `Code: ${callableError.code}` : null,
    callableError.message ? `Message: ${callableError.message}` : null,
    details ? `Details: ${JSON.stringify(details)}` : null,
  ].filter(Boolean);

  return parts.join(' | ') || 'An unknown error occurred.';
}


const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  clientId: z.string({ required_error: 'Please select a client.' }),
  marketerId: z.string().optional(),
  principal: z.coerce.number().positive({ message: 'Principal must be a positive number.' }),
  profitRate: z.coerce.number().min(0, { message: 'Profit rate cannot be negative.' }),
  managementFeeRate: z.coerce.number().min(0, { message: 'Management fee rate cannot be negative.' }),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).default('Murabaha'),
  wakalahGranted: z.boolean().default(false),
  wakalahAssetDescription: z.string().trim().optional(),
  wakalahSupplierName: z.string().trim().optional(),
  guarantorName: z.string().trim().min(2, { message: 'Guarantor name is required.' }),
  guarantorAddress: z.string().trim().min(5, { message: 'Guarantor address is required.' }),
  guarantorPhoneNumber: z.string().trim().min(7, { message: 'Guarantor phone number is required.' }),
  guarantorOccupation: z.string().trim().min(2, { message: 'Guarantor occupation is required.' }),
  guarantorPhotoURL: z.string().url({ message: 'Upload the guarantor photograph.' }),
  durationValue: z.coerce.number().positive().int({ message: 'Duration must be a positive number.' }),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.literal('Equal Installments'),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  startDate: z.date().optional(),
}).superRefine((values, context) => {
  if (values.financingMode === 'Murabaha' && (!values.wakalahAssetDescription || values.wakalahAssetDescription.length < 3)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahAssetDescription'], message: 'Describe the approved asset for the Murabaha sales contract.' });
  if (!values.wakalahGranted) return;
  if (values.financingMode !== 'Murabaha') context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahGranted'], message: 'Available only for Murabaha deals.' });
  if (!values.wakalahSupplierName || values.wakalahSupplierName.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahSupplierName'], message: 'Enter the approved supplier.' });
});

type CreateDealFormProps = {
  onDealCreated: () => void;
};

type Client = {
  id: string;
  name: string;
  role?: LegacyRole;
  email: string;
  personas?: Persona[];
};

type Marketer = {
  id: string;
  name: string;
  role?: LegacyRole;
  personas?: Persona[];
}

export function CreateDealForm({ onDealCreated }: CreateDealFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();

  const clientsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore]);

  const marketersQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore]);

  const { data: allUsersForClients, loading: clientsLoading } = useCollection<Client>(clientsQuery);
  const { data: allUsersForMarketers, loading: marketersLoading } = useCollection<Marketer>(marketersQuery);
  const clients = useMemo(
    () => (allUsersForClients || []).filter((user) => hasPersona(user, 'CLIENT')),
    [allUsersForClients]
  );
  const marketers = useMemo(
    () => (allUsersForMarketers || []).filter((user) => hasPersona(user, 'MARKETER')),
    [allUsersForMarketers]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealName: '',
      principal: 10000,
      profitRate: 5,
      managementFeeRate: 2,
      durationValue: 12,
      durationUnit: 'Months',
      repaymentType: 'Equal Installments',
      repaymentFrequency: 'Monthly',
      financingMode: 'Murabaha',
      wakalahGranted: false,
      wakalahAssetDescription: '',
      wakalahSupplierName: '',
      guarantorName: '',
      guarantorAddress: '',
      guarantorPhoneNumber: '',
      guarantorOccupation: '',
      guarantorPhotoURL: '',
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
      const payload = {
        ...values,
        marketerId: values.marketerId || undefined,
      };

      const data = await createDealAction(await getRequiredIdToken(), selectedClient.name, payload);

      if (data.success) {
        toast({
          title: 'Deal Created',
          description: data.message,
        });
        onDealCreated();
      } else {
        const description = [
          data.message,
          'details' in data && data.details ? JSON.stringify(data.details) : null,
        ].filter(Boolean).join(' | ');
        const attemptedPayload = {
          ...values,
          marketerId: values.marketerId || undefined,
          clientName: selectedClient.name,
          startDate: values.startDate ? values.startDate.toISOString() : undefined,
        };
        // Server-declared action failures are recoverable application states.
        // The server already records unexpected details, so avoid triggering
        // the Next.js development error overlay here.
        console.warn(`Deal Creation Failed: ${description}\n${JSON.stringify({ description, attemptedPayload }, null, 2)}`);
        toast({ variant: 'destructive', title: 'Deal Creation Failed', description });
      }
    } catch (error: unknown) {
      const description = getDealCreationErrorMessage(error);
      const attemptedPayload = {
        ...values,
        marketerId: values.marketerId || undefined,
        clientName: selectedClient.name,
        startDate: values.startDate ? values.startDate.toISOString() : undefined,
      };
      const logMessage = `Deal Creation Error: ${description}\n${JSON.stringify({ description, attemptedPayload }, null, 2)}`;
      if (description.includes('session is no longer valid') || description.includes('session has expired')) {
        // Authentication expiry is an expected recoverable state, not an app
        // exception. Avoid triggering the Next.js development error overlay.
        console.warn(logMessage);
      } else {
        console.error(logMessage);
      }
      toast({ variant: 'destructive', title: 'Deal Creation Failed', description });
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
        <FormField
          control={form.control}
          name="marketerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Attributed Marketer (Optional)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={marketersLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={marketersLoading ? "Loading marketers..." : "Select a marketer"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {marketers?.map(marketer => (
                    <SelectItem key={marketer.id} value={marketer.id}>{marketer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>If this deal was sourced by a marketer, select them here.</FormDescription>
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
              <Select onValueChange={(value) => { field.onChange(value); if (value !== 'Murabaha') form.setValue('wakalahGranted', false); }} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Murabaha">Murabaha (Cost-Plus)</SelectItem>
                  <SelectItem value="Ijara">Ijara (Leasing)</SelectItem>
                  <SelectItem value="Mudaraba">Mudaraba (Profit Sharing)</SelectItem>
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
        {form.watch('financingMode') === 'Murabaha' && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
            <FormField control={form.control} name="wakalahAssetDescription" render={({ field }) => <FormItem><FormLabel>Approved Asset(s)</FormLabel><FormControl><Input placeholder="e.g. 500 bags of cement at the approved total cost" {...field} /></FormControl><FormDescription>This appears in the required Murabaha sales contract.</FormDescription><FormMessage /></FormItem>} />
            <FormField control={form.control} name="wakalahGranted" render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4 space-y-0"><div><FormLabel>Grant Client Procurement Authority</FormLabel><FormDescription>Create a Wakalah agreement allowing this client to procure the approved asset for NAL.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormMessage /></FormItem>
            )} />
            {form.watch('wakalahGranted') && <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="wakalahSupplierName" render={({ field }) => <FormItem><FormLabel>Approved Supplier</FormLabel><FormControl><Input placeholder="Supplier or business name" {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>}
          </div>
        )}
        <div className="rounded-lg border p-4 space-y-4">
          <div><h3 className="font-semibold">Required Guarantor</h3><p className="text-sm text-muted-foreground">Every deal must have a guarantor whose details will appear on the Kafaalah bond.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField control={form.control} name="guarantorName" render={({ field }) => <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="guarantorPhoneNumber" render={({ field }) => <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="guarantorOccupation" render={({ field }) => <FormItem><FormLabel>Occupation</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="guarantorAddress" render={({ field }) => <FormItem><FormLabel>Residential Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
          </div>
          <FormField control={form.control} name="guarantorPhotoURL" render={({ field }) => <FormItem><FormControl><GuarantorPhotoField value={field.value} guarantorName={form.watch('guarantorName')} onChange={field.onChange} disabled={isLoading} /></FormControl><FormMessage /></FormItem>} />
        </div>
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
                </SelectContent>
              </Select>
              <FormDescription>Principal and profit are divided uniformly across every repayment period.</FormDescription>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Deal Start Date (Optional)</FormLabel>
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
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => form.setValue('startDate', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  The official start of the loan term. Determines the repayment schedule.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading || clientsLoading}>
          {(isLoading || clientsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Deal
        </Button>
      </form>
    </Form>
  );
}
