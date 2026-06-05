'use client';

import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons";
import { useCompanyLogo } from "@/components/company-logo-provider";

export default function TermsOfUsePage() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="app-shell">
      <header className="app-topbar sticky top-0 z-50 w-full">
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

      <main className="app-content px-4 py-10 md:py-16">
        <div className="surface-panel mx-auto max-w-4xl space-y-6 rounded-lg p-6 sm:p-8 lg:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Gavel className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-headline sm:text-4xl">Terms of Use</h1>
          </div>
          <p className="text-muted-foreground italic">Last Updated: March 2024</p>

          <section className="space-y-4 pt-8">
            <h2 className="text-2xl font-bold font-headline">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using the NAL General Marchant platform, you agree to be bound by these Terms of Use. If you represent a business or other entity, you agree to these terms on behalf of that entity.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">2. Nature of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              NAL General Marchant provides a digital hub for structured financing. The platform facilitates interactions between:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Investors:</strong> Who provide capital for financing deals under Mudaraba (profit-sharing) structures.</li>
              <li><strong>Clients:</strong> Who seek financing for business operations or asset acquisition under Murabaha or Ijara structures.</li>
              <li><strong>Administrators:</strong> Who orchestrate deal funding, verify repayments, and manage platform governance.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">3. Sharia Compliance Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our platform is designed to facilitate Islamic Financing modes. While we strive to maintain high standards of Sharia integrity in our digital workflows, users are encouraged to consult with their own Sharia advisors regarding the specifics of their individual contracts and participation.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">4. User Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              Users are responsible for maintaining the confidentiality of their account credentials. Clients are responsible for the timely lodgment of repayments as per their agreed schedule. Investors acknowledge that capital deployment involves inherent business risks.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">5. AI Analyzer Usage</h2>
            <p className="text-muted-foreground leading-relaxed">
              The "Smart Deal Analyzer" provides AI-generated assessments for informational purposes only. These analyses do not constitute financial advice. Final decisions on deal viability and funding reside solely with the platform administrators and involved parties.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline">6. Termination of Access</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate access to the platform for users who violate these terms, provide fraudulent information, or engage in activities that compromise the integrity of the financing ecosystem.
            </p>
          </section>

          <section className="space-y-4 border-t pt-8">
            <h2 className="text-2xl font-bold font-headline">Contact Information</h2>
            <p className="text-muted-foreground">
              For questions regarding these terms, please contact us at support@nalmarchant.com.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
