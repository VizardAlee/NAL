
'use client';

import { Logo } from "@/components/icons";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { useCompanyLogo } from "@/components/company-logo-provider";

export default function LoginPage() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="auth-shell">
      <div className="w-full max-w-md">
        <div className="auth-lockup">
          <Link href="/" className="auth-brand">
            <Logo imageUrl={logoUrl} className="h-9 w-9" />
            <span className="text-xl font-bold font-headline sm:text-2xl">
              NAL General Marchant
            </span>
          </Link>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
