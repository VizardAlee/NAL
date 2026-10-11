
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuth } from "@/firebase";
import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { getDefaultRouteForUser } from "@/lib/access-control";
import { resolvePreferredPortal } from "@/lib/active-portal";
import { loadAuthenticatedProfileAction } from "./actions";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const auth = useAuth();
  useEffect(() => setIsReady(true), []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setLoginError("");
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Firebase is not available. Please try again later.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const userCredential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        values.password
      );
      
      const user = userCredential.user;
      const authToken = await user.getIdToken();
      const profileResult = await loadAuthenticatedProfileAction({ authToken });

      if (!profileResult.success) {
        throw new Error(profileResult.message);
      }

      const userData = profileResult.profile;
      toast({
        title: "Login Successful",
        description: "Redirecting to your dashboard...",
      });

      const preferredPortal = resolvePreferredPortal(userData, user.uid);
      router.push(getDefaultRouteForUser(userData, preferredPortal));

    } catch (error) {
      let errorMessage = "An unexpected error occurred. Please try again.";
      let expectedLoginFailure = false;

      if (error instanceof FirebaseError) {
         switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            expectedLoginFailure = true;
            errorMessage = 'Invalid email or password. Check your details or use “Forgot your password?” below.';
            break;
          case 'auth/invalid-email':
            expectedLoginFailure = true;
            errorMessage = 'Please enter a valid email address.';
            break;
          case 'auth/user-disabled':
            expectedLoginFailure = true;
            errorMessage = 'This account has been disabled.';
            break;
          case 'auth/too-many-requests':
            expectedLoginFailure = true;
            errorMessage = 'Too many unsuccessful attempts. Wait a few minutes or reset your password.';
            break;
          case 'auth/network-request-failed':
            expectedLoginFailure = true;
            errorMessage = 'Authentication could not reach Firebase. Check your connection and try again.';
            break;
          default:
            errorMessage = 'Authentication failed unexpectedly. Please try again.';
        }
      } else if (error instanceof Error) {
         errorMessage = error.message;
      }

      // Incorrect credentials are normal form validation, not application
      // exceptions. Logging them with console.error makes the Next.js
      // development overlay report a false application error.
      if (!expectedLoginFailure) {
        console.warn("Unexpected login failure:", error);
      }

      setLoginError(errorMessage);
      
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: errorMessage,
      });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-semibold tracking-tight sm:text-4xl">Login</h1>
        <p className="mt-3 text-sm text-muted-foreground">Enter your credentials to access your workspace.</p>
      </div>
      <div>
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="username" placeholder="name@example.com" autoCapitalize="none" autoCorrect="off" {...field} />
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
                  <div className="relative">
                    <FormControl><Input autoComplete="current-password" type={showPassword ? 'text' : 'password'} className="pr-12" placeholder="••••••••" {...field} /></FormControl>
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 text-muted-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" size="lg" disabled={!isReady || !auth || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {loginError && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {loginError}
              </p>
            )}
          </form>
        </Form>
        <div className="mt-4 text-center text-sm">
           <p className="text-muted-foreground">
             Account access is by admin invitation only.
           </p>
            <p className="text-muted-foreground mt-2">
                <Link href="/forgot-password" passHref className="text-sm font-medium text-primary hover:underline">
                    Forgot your password?
                </Link>
            </p>
         </div>
      </div>
    </div>
  );
}
