"use client";
import { Logo } from '@/components/icons';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, FileCheck2, ShieldCheck, Layers } from 'lucide-react';
import { LoginForm } from './login-form';
import { useCompanyLogo } from '@/components/company-logo-provider';
import { useLanguage } from '@/components/language-provider';
import { guideLabels } from '@/lib/user-guide';
export default function LoginPage() {
  const { logoUrl } = useCompanyLogo(); const { language } = useLanguage();
  return <main id="main-content" tabIndex={-1} className="mx-auto grid min-h-svh w-full max-w-[1600px] lg:grid-cols-[.95fr_1.05fr]">
    <aside className="nal-auth-story relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
      <Link href="/" className="relative flex items-center gap-3 font-headline text-lg font-semibold"><span className="rounded-lg bg-white p-1.5"><Logo imageUrl={logoUrl} className="h-8 w-8" /></span>NAL General Merchant</Link>
      <div className="relative my-16"><p className="text-xs uppercase tracking-[.2em] text-[#d0bc8d]">Your NAL workspace</p><h2 className="mt-5 max-w-lg font-headline text-5xl font-medium leading-[1.12] tracking-tight">Clarity for every<br />commercial journey.</h2><p className="mt-6 max-w-md text-base leading-relaxed text-white/65">Your accounts, agreements and activity, together in one place.</p><div className="mt-10 space-y-4 text-sm text-white/85"><p className="flex items-center gap-3"><Layers className="h-4 w-4 text-[#d0bc8d]" />One workspace for your role</p><p className="flex items-center gap-3"><FileCheck2 className="h-4 w-4 text-[#d0bc8d]" />Clear records and documented decisions</p><p className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-[#d0bc8d]" />Access by administrator invitation</p></div></div>
      <p className="relative text-xs text-white/50">Trade-based · Asset-backed · Partnership-oriented</p>
    </aside>
    <section className="flex min-w-0 flex-col px-5 py-7 sm:px-10 lg:px-16"><Link href="/" className="flex w-fit items-center gap-2.5 text-sm font-semibold text-primary lg:hidden"><Logo imageUrl={logoUrl} className="h-8 w-8" />NAL General Merchant</Link><Link href="/" className="ml-auto hidden items-center gap-2 text-sm text-muted-foreground hover:text-primary lg:flex">Back to NAL <ArrowUpRight className="h-4 w-4" /></Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 sm:py-16"><p className="nal-eyebrow mb-3">Welcome to your workspace</p><LoginForm /><Link href="/help" className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"><BookOpen className="h-4 w-4" />{guideLabels.guide[language]}</Link></div>
      <footer className="flex justify-center gap-5 text-xs text-muted-foreground"><Link href="/privacy" className="hover:text-primary">Privacy</Link><Link href="/terms" className="hover:text-primary">Terms</Link></footer>
    </section>
  </main>;
}
