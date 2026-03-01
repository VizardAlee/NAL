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
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  phoneNumber: z.string().optional(),
  inviteToken: z.string().min(20, { message: 'Invalid invite token.' }),
  referralCode: z.string().optional(),
});

type InviteState = {
  loading: boolean;
  valid: boolean;
  email?: string;
  role?: string;
  accessRole?: string;
  personas?: string[];
  primaryPortal?: string;
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
        });
        form.setValue('email', result.email || '');
        form.setValue('inviteToken', inviteToken);
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
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center space-x-2 text-primary">
            <Logo imageUrl={logoUrl} className="h-8 w-8" />
            <span className="text-2xl font-bold font-headline">
              NAL General Marchant
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
              <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">Invite Required</p>
                <p className="text-muted-foreground">{inviteState.message || 'This signup link is not valid.'}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">Go to Login</Link>
                </Button>
              </div>
            ) : (
            <Form {...form}>
                <form 
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                >
                    <FormField
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
                    />
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
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
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
                    />
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SignupPageContent />
    </Suspense>
  );
}
