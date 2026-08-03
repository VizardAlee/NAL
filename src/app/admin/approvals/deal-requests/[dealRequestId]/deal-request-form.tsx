
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
import { useState, useTransition } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { approveDealAction, rejectDealAction } from './actions';
import { useRouter } from 'next/navigation';
import { getRequiredIdToken } from '@/firebase/auth-token';

const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  principal: z.coerce.number().positive({ message: 'Principal must be a positive number.' }),
  profitRate: z.coerce.number().min(0, { message: 'Profit rate cannot be negative.' }),
  managementFeeRate: z.coerce.number().min(0, { message: 'Management fee rate cannot be negative.' }),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']),
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
}).superRefine((values, context) => {
  if (values.financingMode === 'Murabaha' && (!values.wakalahAssetDescription || values.wakalahAssetDescription.length < 3)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahAssetDescription'], message: 'Describe the approved asset for the Murabaha sales contract.' });
  if (!values.wakalahGranted) return;
  if (values.financingMode !== 'Murabaha') context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahGranted'], message: 'Available only for Murabaha deals.' });
  if (!values.wakalahSupplierName || values.wakalahSupplierName.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['wakalahSupplierName'], message: 'Enter the approved supplier.' });
});

type DealRequestFormProps = {
  dealRequest: any;
};

export function DealRequestForm({ dealRequest }: DealRequestFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isApprovePending, startApproveTransition] = useTransition();
  const [isRejectPending, startRejectTransition] = useTransition();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealName: dealRequest.dealName,
      principal: dealRequest.principal,
      profitRate: dealRequest.profitRate,
      managementFeeRate: dealRequest.managementFeeRate || 0,
      financingMode: dealRequest.financingMode || 'Murabaha',
      wakalahGranted: false,
      wakalahAssetDescription: dealRequest.dealName || '',
      wakalahSupplierName: '',
      guarantorName: dealRequest.guarantorName || '',
      guarantorAddress: dealRequest.guarantorAddress || '',
      guarantorPhoneNumber: dealRequest.guarantorPhoneNumber || '',
      guarantorOccupation: dealRequest.guarantorOccupation || '',
      guarantorPhotoURL: dealRequest.guarantorPhotoURL || '',
      durationValue: dealRequest.durationValue,
      durationUnit: dealRequest.durationUnit,
      repaymentType: 'Equal Installments',
      repaymentFrequency: dealRequest.repaymentFrequency,
    },
  });

  async function onApprove(values: z.infer<typeof formSchema>) {
    startApproveTransition(async () => {
      const result = await approveDealAction(await getRequiredIdToken(), dealRequest.id, dealRequest.clientId, dealRequest.clientName, values);
      if (result.success) {
        toast({ title: 'Success', description: result.message });
        router.push('/admin/approvals/deal-requests');
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  }

  async function onReject() {
      startRejectTransition(async () => {
          const result = await rejectDealAction(await getRequiredIdToken(), dealRequest.id);
          if(result.success) {
              toast({title: "Request Rejected", description: result.message});
              router.push('/admin/approvals/deal-requests');
          } else {
              toast({variant: 'destructive', title: 'Error', description: result.message});
          }
      })
  }

  return (
    <Card>
        <CardHeader><CardTitle>Review & Edit Deal Terms</CardTitle></CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onApprove)} className="space-y-4">
                <FormField
                control={form.control}
                name="dealName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Deal Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField control={form.control} name="financingMode" render={({ field }) => (
                  <FormItem><FormLabel>Financing Mode</FormLabel><Select onValueChange={(value) => { field.onChange(value); if (value !== 'Murabaha') form.setValue('wakalahGranted', false); }} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Murabaha">Murabaha (Cost-Plus)</SelectItem><SelectItem value="Ijara">Ijara (Leasing)</SelectItem><SelectItem value="Mudaraba">Mudaraba (Profit Sharing)</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                )} />
                {form.watch('financingMode') === 'Murabaha' && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
                    <FormField control={form.control} name="wakalahAssetDescription" render={({ field }) => <FormItem><FormLabel>Approved Asset(s)</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>This appears in the required Murabaha sales contract.</FormDescription><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="wakalahGranted" render={({ field }) => <FormItem className="flex items-center justify-between gap-4 space-y-0"><div><FormLabel>Grant Client Procurement Authority</FormLabel><FormDescription>Issue a Wakalah agreement authorizing this client to procure the asset for NAL.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormMessage /></FormItem>} />
                    {form.watch('wakalahGranted') && <FormField control={form.control} name="wakalahSupplierName" render={({ field }) => <FormItem><FormLabel>Approved Supplier</FormLabel><FormControl><Input placeholder="Supplier or business name" {...field} /></FormControl><FormMessage /></FormItem>} />}
                  </div>
                )}
                <div className="rounded-lg border p-4 space-y-4">
                  <div><h3 className="font-semibold">Required Guarantor</h3><p className="text-sm text-muted-foreground">Verify these details before approving the deal.</p></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="guarantorName" render={({ field }) => <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="guarantorPhoneNumber" render={({ field }) => <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="guarantorOccupation" render={({ field }) => <FormItem><FormLabel>Occupation</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="guarantorAddress" render={({ field }) => <FormItem><FormLabel>Residential Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                  </div>
                  <FormField control={form.control} name="guarantorPhotoURL" render={({ field }) => <FormItem><FormControl><GuarantorPhotoField value={field.value} guarantorName={form.watch('guarantorName')} onChange={field.onChange} disabled={isApprovePending || isRejectPending} /></FormControl><FormMessage /></FormItem>} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="principal"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Principal Amount</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
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
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField control={form.control} name="managementFeeRate" render={({ field }) => <FormItem><FormLabel>Management Fee (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormDescription>Charged separately from the Murabaha contract price.</FormDescription><FormMessage /></FormItem>} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="durationValue"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Duration</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
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
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="destructive" onClick={onReject} disabled={isRejectPending || isApprovePending}>
                        {isRejectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <XCircle className="mr-2 h-4 w-4" />}
                        Reject
                    </Button>
                    <Button type="submit" disabled={isApprovePending || isRejectPending}>
                        {isApprovePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                        Approve Deal
                    </Button>
                </div>
            </form>
            </Form>
        </CardContent>
    </Card>
  );
}
