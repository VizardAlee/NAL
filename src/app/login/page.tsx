
'use client';

import { Logo } from "@/components/icons";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { useCompanyLogo } from "@/components/company-logo-provider";
import { useLanguage } from '@/components/language-provider';
import { guideLabels } from '@/lib/user-guide';

export default function LoginPage() {
  const { logoUrl } = useCompanyLogo();
  const { language } = useLanguage();

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
        <LoginForm />
        <p className="mt-4 text-center text-sm"><Link href="/help" className="font-medium text-primary underline underline-offset-4">{guideLabels.guide[language]}</Link></p>
      </div>
    </div>
  );
}
