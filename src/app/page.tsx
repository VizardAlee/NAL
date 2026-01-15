
'use client';

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, CheckCircle, LineChart, Users } from "lucide-react";
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

export default function Home() {
  const { logoUrl } = useCompanyLogo();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
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

      {/* Image Section */}
      <section className="w-full py-8 bg-background">
        <div className="container flex justify-center">
          <Image
            src="/business_hub.png"
            alt="Descriptive write-up"
            width={800}
            height={134}
            className="object-contain max-w-3xl"
          />
        </div>
      </section>

      <main className="flex-1">
        <section className="container py-12 sm:py-24 md:py-32">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="flex flex-col justify-center space-y-6">
              <h1 className="text-4xl font-bold tracking-tighter font-headline sm:text-5xl xl:text-6xl/none">
                The Central Hub for Your Financing Ecosystem
              </h1>
              <p className="max-w-[600px] text-muted-foreground md:text-xl">
                NAL General Marchant connects investors, clients, and administrators on a single platform to manage financing deals with unparalleled efficiency and insight.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Get Started
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/#features">
                    Learn More
                  </Link>
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center">
              {heroImage && (
                <Image
                  src={heroImage.imageUrl}
                  alt={heroImage.description}
                  data-ai-hint={heroImage.imageHint}
                  width={600}
                  height={400}
                  className="rounded-xl object-cover shadow-2xl"
                />
              )}
            </div>
          </div>
        </section>

        <StatsCounter />

        <section id="features" className="w-full bg-background py-12 md:py-24 lg:py-32">
          <div className="container">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Key Features</div>
                <h2 className="text-3xl font-bold tracking-tighter font-headline sm:text-5xl">Role-Based Dashboards for Every User</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Tailored experiences for investors, clients, and administrators ensure everyone has the right information at their fingertips.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:max-w-none lg:grid-cols-3 mt-12">
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
        
        <section className="bg-muted/50 py-12 md:py-24 lg:py-32">
          <div className="container grid gap-10 md:grid-cols-2 md:gap-16">
            <div className="space-y-4">
              <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Powered by AI</div>
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
                <Image
                  src={aiImage.imageUrl}
                  alt={aiImage.description}
                  data-ai-hint={aiImage.imageHint}
                  width={600}
                  height={400}
                  className="rounded-xl object-cover shadow-2xl"
                />
              )}
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
    <Card className="overflow-hidden">
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
        <div className="flex items-center gap-4">
          {icon}
          <CardTitle className="font-headline">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
