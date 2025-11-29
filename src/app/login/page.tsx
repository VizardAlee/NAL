
'use client';

import { Logo } from "@/components/icons";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { useCompanyLogo } from "@/components/company-logo-provider";

export default function LoginPage() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center space-x-2 text-primary">
            <Logo imageUrl={logoUrl} className="h-8 w-8" />
            <span className="text-2xl font-bold font-headline">
              NAL
            </span>
          </Link>
        </div>
        <LoginForm />
         <div className="mt-4 text-center text-sm">
           <p className="text-muted-foreground">
             Don't have an account?{' '}
             <Link href="/signup" className="font-medium text-primary hover:underline">
                Sign up
             </Link>
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
