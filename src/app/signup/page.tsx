'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useEffect, useMemo, useState, useTransition, Suspense } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Logo } from '@/components/icons';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { getInviteDetailsAction, signUpWithEmailAction } from './actions';
import { useCompanyLogo } from '@/components/company-logo-provider';

const formSchema = z.object({
  name: z.string().optional().default(''),
  accountType: z.enum(['Individual', 'Organization']),
  organizationName: z.string().optional(),
  organizationRegistrationNumber: z.string().optional(),
  organizationAddress: z.string().optional(),
  representativeName: z.string().optional(),
  representativeTitle: z.string().optional(),
  representativePhoneNumber: z.string().optional(),
  representativeIdType: z.string().optional(),
  representativeIdNumber: z.string().optional(),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  phoneNumber: z.string().optional(),
  inviteToken: z.string().min(20, { message: 'Invalid invite token.' }),
  referralCode: z.string().optional(),
}).superRefine((data, ctx) => {
  const require = (field: keyof typeof data, value: string | undefined, message: string) => {
    if (!value?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  };
  if (data.accountType === 'Organization') {
    require('organizationName', data.organizationName, 'Organization name is required.');
    require('organizationRegistrationNumber', data.organizationRegistrationNumber, 'Registration number is required.');
    require('organizationAddress', data.organizationAddress, 'Registered address is required.');
    require('representativeName', data.representativeName, 'Representative name is required.');
    require('representativeTitle', data.representativeTitle, 'Representative capacity is required.');
    require('representativePhoneNumber', data.representativePhoneNumber, 'Representative phone is required.');
    require('representativeIdType', data.representativeIdType, 'Identity type is required.');
    require('representativeIdNumber', data.representativeIdNumber, 'Identity number is required.');
  } else require('name', data.name, 'Full name is required.');
});

type InviteState = {
  loading: boolean;
  valid: boolean;
  email?: string;
  role?: string;
  accessRole?: string;
  personas?: string[];
  primaryPortal?: string;
  isMuslim?: boolean;
  accountType?: 'Individual' | 'Organization';
  message?: string;
};

function SignupPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const { logoUrl } = useCompanyLogo();
  const searchParams = useSearchParams();
  const inviteToken = useMemo(() => searchParams.get('invite') || '', [searchParams]);
  const [isPending, startTransition] = useTransition();
  const [inviteState, setInviteState] = useState<InviteState>({ loading: true, valid: false });
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      phoneNumber: '',
      inviteToken: inviteToken,
      referralCode: '',
      accountType: 'Individual',
      organizationName: '', organizationRegistrationNumber: '', organizationAddress: '',
      representativeName: '', representativeTitle: '', representativePhoneNumber: '',
      representativeIdType: '', representativeIdNumber: '',
    },
  });

  useEffect(() => {
    let mounted = true;
    const validateInvite = async () => {
      if (!inviteToken) {
        setInviteState({ loading: false, valid: false, message: 'Missing invite token.' });
        return;
      }

      const result = await getInviteDetailsAction(inviteToken);
      if (!mounted) return;

      if (result.valid) {
        setInviteState({
          loading: false,
          valid: true,
          email: result.email,
          role: result.role,
          accessRole: result.accessRole,
          personas: result.personas,
          primaryPortal: result.primaryPortal,
          isMuslim: result.isMuslim,
          accountType: result.accountType,
        });
        form.setValue('email', result.email || '');
        form.setValue('inviteToken', inviteToken);
        form.setValue('accountType', result.accountType || 'Individual');
      } else {
        setInviteState({ loading: false, valid: false, message: result.message || 'Invalid invite.' });
      }
    };

    void validateInvite();
    return () => {
      mounted = false;
    };
  }, [inviteToken, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!inviteState.valid) return;

    startTransition(async () => {
        const result = await signUpWithEmailAction(values);
        if (result.success) {
            toast({ title: "Success", description: result.message });
            router.push('/login');
        } else {
            toast({ variant: 'destructive', title: 'Sign-up Failed', description: result.message });
        }
    });
  }


  return (
    <div className="auth-shell">
      <div className="w-full max-w-md">
        <div className="auth-lockup">
          <Link href="/" className="auth-brand">
            <Logo imageUrl={logoUrl} className="h-9 w-9" />
            <span className="text-xl font-bold font-headline sm:text-2xl">
              NAL General Merchant
            </span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Create an Account</CardTitle>
            <CardDescription>
              Complete your account setup using your invite link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inviteState.loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating invite...
              </div>
            ) : !inviteState.valid ? (
              <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm shadow-sm">
                <p className="font-medium text-destructive">Invite Required</p>
                <p className="text-muted-foreground">{inviteState.message || 'This signup link is not valid.'}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">Go to Login</Link>
                </Button>
              </div>
            ) : (
            <Form {...form}>
                <form 
                    method="post"
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                >
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                      Contracting party: <strong>{inviteState.accountType || 'Individual'}</strong>
                    </div>
                    {inviteState.accountType === 'Organization' ? <>
                    <FormField control={form.control} name="organizationName" render={({ field }) => <FormItem><FormLabel>Registered Organization Name</FormLabel><FormControl><Input placeholder="Kamal Babbangari General Enterprise" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="organizationRegistrationNumber" render={({ field }) => <FormItem><FormLabel>Registration Number</FormLabel><FormControl><Input placeholder="RC or BN number" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="organizationAddress" render={({ field }) => <FormItem><FormLabel>Registered Business Address</FormLabel><FormControl><Input placeholder="Registered office address" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <div className="border-t pt-4"><p className="font-medium">Authorised representative</p><p className="text-sm text-muted-foreground">This person will access the account and sign agreements for the organization.</p></div>
                    <FormField control={form.control} name="representativeName" render={({ field }) => <FormItem><FormLabel>Representative Full Legal Name</FormLabel><FormControl><Input placeholder="Full legal name" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="representativeTitle" render={({ field }) => <FormItem><FormLabel>Capacity / Title</FormLabel><FormControl><Input placeholder="Director, Proprietor, Partner, Trustee…" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="representativePhoneNumber" render={({ field }) => <FormItem><FormLabel>Representative Phone Number</FormLabel><FormControl><Input placeholder="+2348012345678" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="representativeIdType" render={({ field }) => <FormItem><FormLabel>Identity Document Type</FormLabel><FormControl><Input placeholder="NIN, passport, driver's licence…" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={form.control} name="representativeIdNumber" render={({ field }) => <FormItem><FormLabel>Identity Document Number</FormLabel><FormControl><Input placeholder="Document number" {...field} /></FormControl><FormMessage /></FormItem>} />
                    </> : <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                                <Input placeholder="John Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />}
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input placeholder="name@example.com" {...field} readOnly />
                            </FormControl>
                            <FormDescription>
                                Invited as: <span className="font-medium">{inviteState.role}</span>
                                {inviteState.personas && inviteState.personas.length > 0 && (
                                  <span className="ml-2 text-muted-foreground">
                                    ({inviteState.personas.join(', ')})
                                  </span>
                                )}
                                {inviteState.personas?.includes('INVESTOR') && typeof inviteState.isMuslim === 'boolean' && (
                                  <span className="ml-2 text-muted-foreground">
                                    · {inviteState.isMuslim ? 'Muslim' : 'Non-Muslim'}
                                  </span>
                                )}
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     {inviteState.accountType !== 'Organization' && <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Phone Number (Optional)</FormLabel>
                            <FormControl>
                                <Input placeholder="+2348012345678" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />}
                    <input type="hidden" {...form.register('accountType')} />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="inviteToken"
                        render={({ field }) => (
                          <input type="hidden" {...field} value={inviteToken} />
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="referralCode"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Referral Code (Optional)</FormLabel>
                            <FormControl>
                                <Input placeholder="MARK-JDOE-123" {...field} />
                            </FormControl>
                             <FormDescription>
                                If you were referred by a marketer, enter their code here.
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Account
                    </Button>
                </form>
            </Form>
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SignupPageContent />
    </Suspense>
  );
}
