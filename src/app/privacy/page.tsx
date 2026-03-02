'use client';

import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons";
import { useCompanyLogo } from "@/components/company-logo-provider";

export default function PrivacyPolicyPage() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Logo imageUrl={logoUrl} className="h-6 w-6 text-primary" />
            <span className="font-bold font-headline">NAL General Marchant</span>
          </Link>
          <div className="flex flex-1 items-center justify-end">
            <Button variant="ghost" asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-12 md:py-24">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight font-headline">Privacy Policy</h1>
          </div>
          <p className="text-muted-foreground italic">Last Updated: March 2024</p>

          <section className="space-y-4 pt-8">
            <h2 className="text-2xl font-bold font-headline flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> 1. Information We Collect
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              To provide a secure financing environment, we collect the following types of information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Identity Data:</strong> Full name, email address, and phone number.</li>
              <li><strong>Compliance Data:</strong> Signed legal documents and KYC (Know Your Customer) information.</li>
              <li><strong>Financial Data:</strong> Transaction history, fund batch details, and repayment schedules.</li>
              <li><strong>Device Data:</strong> IP address and notification tokens for push alerts.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">2. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is used strictly for platform operations, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Verification of financing requests and capital deposits.</li>
              <li>Automation of Zakat eligibility and performance calculations.</li>
              <li>Real-time notifications regarding deal approvals and payment reminders.</li>
              <li>Strategic oversight for platform owners and administrators.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> 3. Data Security & Access
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement strict role-based access control (RBAC). Your financial data is only visible to you and relevant administrative roles (Admins, Owners, Legal, or Recovery teams) as required to fulfill the financing obligations.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">4. Sharing of Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal data to third parties. Information may only be shared with legal or recovery professionals in the event of deal default or escalation, as per the structured recovery workflow of the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">5. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access your personal data and request corrections via your dashboard settings. For legal reasons, certain financial transaction records must be retained for auditing purposes even after account closure.
            </p>
          </section>

          <section className="space-y-4 border-t pt-8">
            <h2 className="text-2xl font-bold font-headline">Privacy Concerns</h2>
            <p className="text-muted-foreground">
              If you have any concerns regarding your privacy on our platform, please reach out to our privacy team at privacy@nalmarchant.com.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
