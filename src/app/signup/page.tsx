
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Logo } from '@/components/icons';
import Link from 'next/link';
import { Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { signUpWithEmailAction } from './actions';
import { Separator } from '@/components/ui/separator';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
});

function EmailSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Sign up with Email
    </Button>
  );
}

function GoogleSubmitButton({ onClick, isPending }: { onClick: () => void, isPending: boolean}) {
    return (
        <Button type="button" variant="outline" className="w-full" disabled={isPending} onClick={onClick}>
             {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 
                <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 173.3 54.7l-73.4 69.4c-22.3-21.3-52.6-34.3-88.9-34.3-72.5 0-131.8 59.4-131.8 131.8s59.4 131.8 131.8 131.8c78.6 0 114.3-58.1 118.8-88.7H248v-95.6h239.8c.2 13.9.1 28.1.1 42.8z"></path>
                </svg>
             }
            Sign up with Google
        </Button>
    )
}

export default function SignupPage() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();

  const [isGooglePending, startGoogleTransition] = useTransition();
  const [emailState, emailFormAction] = useActionState(signUpWithEmailAction, { success: false, message: '' });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  useEffect(() => {
    if (emailState.message) {
        if(emailState.success) {
            toast({ title: "Success", description: emailState.message });
            if (emailState.redirectUrl) {
                router.push(emailState.redirectUrl);
            }
        } else {
            toast({ variant: 'destructive', title: 'Sign-up Failed', description: emailState.message });
        }
    }
  }, [emailState, toast, router]);

  const handleGoogleSignUp = async () => {
    if (!auth || !firestore) return;
    const provider = new GoogleAuthProvider();

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        startGoogleTransition(async () => {
            const userDocRef = doc(firestore, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                await setDoc(userDocRef, {
                    name: user.displayName,
                    email: user.email,
                    role: null,
                });
            }
            
            toast({ title: 'Success', description: "Signed in successfully. Let's set up your profile." });
            router.push('/signup/role');
        });

    } catch (error: any) {
        if (error.code !== 'auth/popup-closed-by-user') {
             toast({
                variant: 'destructive',
                title: 'Google Sign-up Failed',
                description: error.message || 'An unknown error occurred.',
            });
        }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center space-x-2 text-primary">
            <Logo className="h-8 w-8" />
            <span className="text-2xl font-bold font-headline">
              NAL General Marchant
            </span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Create an Account</CardTitle>
            <CardDescription>
              Join the platform as an Investor or a Client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form action={emailFormAction} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="name@example.com" type="email" {...field} /></FormControl>
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
                      <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <EmailSubmitButton />
              </form>
            </Form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
            </div>

            <GoogleSubmitButton onClick={handleGoogleSignUp} isPending={isGooglePending} />

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
