'use client';

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, CheckCircle, LineChart, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCompanyLogo } from "@/components/company-logo-provider";
import { StatsCounter } from "@/components/stats-counter";
import { Animated } from "@/components/animated";

const trustPoints = [
  { icon: ShieldCheck, label: "Role-Based Security" },
  { icon: Wallet, label: "Structured Fund Flow" },
  { icon: Sparkles, label: "AI-Assisted Analysis" },
];

export default function Home() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="home-gradient-bg flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/30 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Logo imageUrl={logoUrl} className="h-6 w-6 text-primary" />
            <span className="font-bold font-headline sm:inline-block">
              NAL General Marchant
            </span>
          </Link>
          <nav className="flex flex-1 items-center space-x-4">
            {/* Future nav links can go here */}
          </nav>
          <div className="flex items-center justify-end space-x-2">
            <ThemeToggle />
            <Button asChild>
              <Link href="/login">
                Login <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container py-10 sm:py-16 md:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="flex flex-col justify-center space-y-7">
              <Image
                src="/business_hub.png"
                alt="Business Hub"
                width={360}
                height={141}
                priority
                className="h-auto w-[240px] object-contain sm:w-[320px] md:w-[360px]"
              />
              <h1 className="max-w-3xl text-4xl font-bold tracking-tighter font-headline sm:text-5xl xl:text-6xl/none">
                Financing Operations, Funds, and Repayments in One Command Center
              </h1>
              <p className="max-w-[620px] text-muted-foreground md:text-xl">
                NAL General Marchant gives investors, clients, and administrators one secure workspace to manage financing deals, approvals, repayments, and portfolio movement.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/login">
                    Enter Platform <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/#features">
                    Learn More
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                {trustPoints.map((point) => (
                  <div key={point.label} className="inline-flex items-center justify-start gap-2 text-sm text-muted-foreground">
                    <point.icon className="h-4 w-4 text-primary" />
                    <span>{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center">
              <ProductHeroPreview />
            </div>
          </div>
        </section>

        <StatsCounter />

        <section id="features" className="w-full py-12 md:py-24 lg:py-28">
          <div className="container text-center">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <Animated className="space-y-2">
                <div className="inline-block rounded-lg border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">Experience</div>
                <h2 className="text-3xl font-bold tracking-tighter font-headline sm:text-5xl">Role-Designed Interfaces, One Shared Platform</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Every persona sees what matters most: investors track returns, clients manage obligations, and admins orchestrate operations.
                </p>
              </Animated>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:max-w-none lg:grid-cols-3 mt-12">
              <Animated delay={200}>
                <FeatureCard 
                  icon={<LineChart className="h-8 w-8 text-accent" />} 
                  title="Investor Dashboard" 
                  description="View your portfolio, reinvest funds, and track earnings. Deploy capital into new financing deals as they become available." 
                  variant="investor"
                />
              </Animated>
               <Animated delay={350}>
                <FeatureCard 
                  icon={<Users className="h-8 w-8 text-accent" />} 
                  title="Client Dashboard" 
                  description="Manage your financing deals. Track loan status, view your repayment schedule, and easily lodge payments for confirmation." 
                  variant="client"
                />
              </Animated>
              <Animated delay={500}>
                <FeatureCard 
                  icon={<CheckCircle className="h-8 w-8 text-accent" />} 
                  title="Admin Control Panel" 
                  description="Get a platform-wide view. Oversee all deals, manage users, approve financial requests, and activate new deals." 
                  variant="admin"
                />
              </Animated>
            </div>
          </div>
        </section>
        
        <section className="bg-muted/50 py-12 md:py-24 lg:py-32">
          <div className="container grid gap-10 md:grid-cols-2 md:gap-16">
            <Animated as="div" className="space-y-4" delay={200}>
              <div className="inline-block rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-foreground">Powered by AI</div>
              <h2 className="text-3xl font-bold tracking-tighter font-headline sm:text-4xl md:text-5xl">Smart Deal Analyzer</h2>
              <p className="max-w-[700px] text-muted-foreground md:text-lg/relaxed">
                Leverage the power of generative AI to assess financing proposals instantly. Paste in deal details and receive an expert analysis of viability, risk level, and key strategic insights to make smarter, faster decisions.
              </p>
              <Button asChild>
                <Link href="/login">
                  Try the Analyzer <Bot className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </Animated>
            <Animated as="div" className="flex items-center justify-center" delay={400}>
              <AnalyzerPreview />
            </Animated>
          </div>
        </section>

        <section className="container pb-16 pt-4 md:pb-24">
          <div className="rounded-3xl border border-primary/20 bg-primary/10 p-8 text-center shadow-xl shadow-primary/10 md:p-12">
            <h3 className="text-2xl font-bold tracking-tight font-headline md:text-4xl">Operate Faster With Fewer Blind Spots</h3>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground md:text-lg">
              From first request to last repayment, keep every transaction and decision in a clean, visible workflow.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">
                  Login <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-background">
        <div className="container py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-start gap-4">
              <div className="flex items-center gap-2">
                <Logo imageUrl={logoUrl} className="h-6 w-6 text-primary" />
                <span className="font-bold font-headline">NAL General Marchant</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Empowering ethical investment and structured financing across Nigeria.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Platform</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/login" className="hover:text-primary transition-colors">Login</Link></li>
                  <li><Link href="/login" className="hover:text-primary transition-colors">Request Access</Link></li>
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Legal</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Use</Link></li>
                  <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-center text-sm leading-loose text-muted-foreground">
              Built by Service Guru. &copy; {new Date().getFullYear()} All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://wa.me/2347032545288"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

type FeatureVariant = 'investor' | 'client' | 'admin';

function FeatureCard({ icon, title, description, variant }: { icon: React.ReactNode, title: string, description: string, variant: FeatureVariant }) {
  return (
    <Card className="home-feature-card overflow-hidden border-white/50 bg-card/90 shadow-md backdrop-blur h-full">
      <FeatureVisual variant={variant} />
      <CardHeader>
        <div className="flex items-center justify-center gap-4">
          {icon}
          <CardTitle className="font-headline">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-center text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function FeatureVisual({ variant }: { variant: FeatureVariant }) {
  if (variant === 'investor') {
    return (
      <div className="home-feature-visual">
        <div className="flex items-end gap-2">
          {[42, 58, 46, 76, 62, 88].map((height, index) => (
            <span key={index} className="w-full rounded-t bg-primary/80" style={{ height }} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md bg-background/80 p-3">
          <span className="text-xs text-muted-foreground">Portfolio yield</span>
          <span className="text-sm font-semibold text-primary">+18.4%</span>
        </div>
      </div>
    );
  }

  if (variant === 'client') {
    return (
      <div className="home-feature-visual">
        <div className="space-y-3">
          {['Principal', 'Markup', 'Next repayment'].map((label, index) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span>{[72, 44, 58][index]}%</span>
              </div>
              <div className="h-2 rounded-full bg-background">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${[72, 44, 58][index]}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md border bg-background/70 p-3 text-xs text-muted-foreground">
          Due date confirmed
        </div>
      </div>
    );
  }

  return (
    <div className="home-feature-visual">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Deals', '24'],
          ['Users', '118'],
          ['Requests', '7'],
          ['Funds', '₦42M'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md bg-background/80 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyzerPreview() {
  return (
    <div className="home-dashboard-preview home-image-pulse w-full max-w-xl">
      <div className="border-b px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">AI Deal Analyzer</p>
          <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-primary">Risk Review</span>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <div className="rounded-md border bg-background/80 p-4">
          <p className="text-xs text-muted-foreground">Proposal summary</p>
          <p className="mt-2 text-lg font-semibold">Inventory financing for approved client</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Viability</p>
              <p className="font-semibold text-primary">Strong</p>
            </div>
            <div className="rounded-md bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Risk</p>
              <p className="font-semibold">Medium</p>
            </div>
            <div className="rounded-md bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Tenor</p>
              <p className="font-semibold">90 days</p>
            </div>
          </div>
        </div>
        <div className="rounded-md border bg-background/80 p-4">
          <p className="text-sm font-semibold">Recommended checks</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>• Confirm collateral documentation</p>
            <p>• Review repayment source history</p>
            <p>• Match markup against risk profile</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductHeroPreview() {
  const approvalRows = [
    { label: 'Client repayment', value: '₦4.8M', status: 'Due Today' },
    { label: 'Investor funding', value: '₦18.2M', status: 'Queued' },
    { label: 'Deal approval', value: '₦32.0M', status: 'Review' },
  ];

  return (
    <div className="home-dashboard-preview w-full max-w-2xl">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        </div>
        <div className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
          Live Operations
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">NAL Command Center</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight font-headline sm:text-3xl">₦128.4M Active Flow</h2>
          </div>
          <div className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            96% visibility
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-xs text-muted-foreground">Active Deals</p>
            <p className="mt-1 text-xl font-semibold">24</p>
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-xs text-muted-foreground">Pending Approvals</p>
            <p className="mt-1 text-xl font-semibold">7</p>
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-xs text-muted-foreground">Repayments</p>
            <p className="mt-1 text-xl font-semibold">₦9.6M</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.82fr]">
          <div className="rounded-md border bg-background/80 p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Fund Allocation</p>
              <span className="text-xs text-muted-foreground">FIFO</span>
            </div>
            <div className="space-y-3">
              {[
                ['Investor pool', '82%'],
                ['Client repayments', '64%'],
                ['Platform earnings', '48%'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: value }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-background/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Approvals</p>
              <span className="rounded-full bg-accent/20 px-2 py-1 text-xs font-medium text-primary">Today</span>
            </div>
            <div className="space-y-3">
              {approvalRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-2">
                  <div>
                    <p className="text-xs font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.status}</p>
                  </div>
                  <p className="text-sm font-semibold">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
