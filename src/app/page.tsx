
'use client';

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, CheckCircle, LineChart, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/icons";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCompanyLogo } from "@/components/company-logo-provider";
import { StatsCounter } from "@/components/stats-counter";

const featureImages = PlaceHolderImages.filter(img => ['feature-investor', 'feature-client', 'feature-admin'].includes(img.id));
const heroImage = PlaceHolderImages.find(img => img.id === 'hero-image');
const aiImage = PlaceHolderImages.find(img => img.id === 'ai-analyzer');
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
        <section className="container py-12 sm:py-20 md:py-24">
          <div className="home-stagger grid grid-cols-1 place-items-center gap-10 md:grid-cols-2 md:gap-14">
            <div className="flex flex-col items-start justify-center space-y-6 text-left">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-medium text-primary">
                Financing Operations, Unified
              </div>
              <h1 className="text-balance text-4xl font-bold tracking-tight font-headline sm:text-5xl xl:text-6xl/none">
                A Modern Control Layer For Deals, Capital, and Approvals
              </h1>
              <p className="max-w-[640px] text-muted-foreground md:text-xl">
                NAL General Marchant brings investors, clients, and administrators into one synchronized workspace for funding, repayments, oversight, and growth.
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Button size="lg" className="shadow-lg shadow-primary/20" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/#features">
                    Learn More
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                {trustPoints.map((point) => (
                  <div key={point.label} className="inline-flex items-center justify-start gap-2 text-sm text-muted-foreground">
                    <point.icon className="h-4 w-4 text-primary" />
                    <span>{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative flex items-center justify-center">
              {heroImage && (
                <div className="home-image-frame">
                  <Image
                    src={heroImage.imageUrl}
                    alt={heroImage.description}
                    data-ai-hint={heroImage.imageHint}
                    width={720}
                    height={480}
                    className="h-[320px] w-full rounded-2xl object-cover sm:h-[420px]"
                  />
                </div>
              )}
              <Card className="home-float-card absolute -bottom-6 -left-2 w-44 border-primary/20 bg-card/90 shadow-lg backdrop-blur sm:w-52">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Repayment Status</p>
                  <p className="mt-1 text-lg font-semibold">Real-Time</p>
                </CardContent>
              </Card>
              <Card className="home-float-card absolute -right-2 -top-6 w-44 border-accent/40 bg-card/90 shadow-lg backdrop-blur sm:w-52">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Funding Engine</p>
                  <p className="mt-1 text-lg font-semibold">FIFO Ready</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <StatsCounter />

        <section id="features" className="w-full py-12 md:py-24 lg:py-28">
          <div className="container text-center">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">Experience</div>
                <h2 className="text-3xl font-bold tracking-tighter font-headline sm:text-5xl">Role-Designed Interfaces, One Shared Platform</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Every persona sees what matters most: investors track returns, clients manage obligations, and admins orchestrate operations.
                </p>
              </div>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl items-stretch gap-8 sm:grid-cols-2 md:gap-10 lg:max-w-none lg:grid-cols-3">
              <FeatureCard
                icon={<LineChart className="h-8 w-8 text-accent" />}
                title="Investor Dashboard"
                description="View your portfolio, reinvest funds, and track earnings. Deploy capital into new financing deals as they become available."
                image={featureImages.find(img => img.id === 'feature-investor')}
              />
              <FeatureCard
                icon={<Users className="h-8 w-8 text-accent" />}
                title="Client Dashboard"
                description="Manage your financing deals. Track loan status, view your repayment schedule, and easily lodge payments for confirmation."
                image={featureImages.find(img => img.id === 'feature-client')}
              />
              <FeatureCard
                icon={<CheckCircle className="h-8 w-8 text-accent" />}
                title="Admin Control Panel"
                description="Get a platform-wide view. Oversee all deals, manage users, approve financial requests, and activate new deals."
                image={featureImages.find(img => img.id === 'feature-admin')}
              />
            </div>
          </div>
        </section>

        <section className="relative py-12 md:py-20 lg:py-24">
          <div className="container grid place-items-center gap-10 md:grid-cols-2 md:gap-16">
            <div className="space-y-4 text-left md:pt-6">
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
            </div>
            <div className="flex items-center justify-center">
              {aiImage && (
                <div className="home-image-frame home-image-pulse">
                  <Image
                    src={aiImage.imageUrl}
                    alt={aiImage.description}
                    data-ai-hint={aiImage.imageHint}
                    width={700}
                    height={460}
                    className="h-[300px] w-full rounded-2xl object-cover sm:h-[380px]"
                  />
                </div>
              )}
            </div>
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

      <footer className="border-t">
        <div className="container flex h-24 items-center justify-center py-10">
          <div className="flex flex-col items-center gap-2 md:flex-row">
            <Logo imageUrl={logoUrl} className="h-6 w-6 text-primary" />
            <p className="text-center text-sm leading-loose">
              Built by Service Guru. &copy; {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, image }: { icon: React.ReactNode, title: string, description: string, image?: { imageUrl: string, description: string, imageHint: string } }) {
  return (
    <Card className="home-feature-card overflow-hidden border-white/50 bg-card/90 shadow-md backdrop-blur">
      {image && (
        <Image
          src={image.imageUrl}
          alt={image.description}
          data-ai-hint={image.imageHint}
          width={600}
          height={400}
          className="w-full h-48 object-cover"
        />
      )}
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
