'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Factory,
  FileCheck2,
  Handshake,
  KeyRound,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { Animated } from '@/components/animated';
import { Logo } from '@/components/icons';
import { NonInterestInstitutionMark } from '@/components/non-interest-institution-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useCompanyLogo } from '@/components/company-logo-provider';

const solutions = [
  {
    icon: ShoppingBag,
    title: 'Asset-backed trade',
    description: 'Purchase and resale of identified goods on transparent deferred-payment terms, with cost and commercial return disclosed.',
  },
  {
    icon: Truck,
    title: 'Supply and procurement',
    description: 'Contract procurement, supply-chain coordination and delivery of approved commodities, materials, machinery and consumables.',
  },
  {
    icon: Boxes,
    title: 'Commodity trading',
    description: 'Structured trading in agricultural produce, raw materials, equipment and other lawful goods for real commercial demand.',
  },
  {
    icon: Factory,
    title: 'Equipment and project solutions',
    description: 'Commercial structures for equipment leasing, manufacturing, construction and defined project-based transactions.',
  },
  {
    icon: Handshake,
    title: 'Partnership ventures',
    description: 'Joint-venture and profit-sharing arrangements that align capital, expertise, execution responsibilities and commercial outcomes.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Agency and asset management',
    description: 'Acting as principal, agent, contractor, intermediary or commercial partner in documented trading and asset arrangements.',
  },
];

const commercialModels = [
  ['Murabaha', 'Cost-plus sale', 'NAL acquires an approved asset and resells it at a disclosed cost and agreed profit.'],
  ['Salam', 'Advance purchase', 'A purchase structure in which payment is made in advance for clearly specified goods delivered later.'],
  ['Istisna', 'Manufacturing or construction', 'A contract for assets or projects that must be manufactured, built or completed to specification.'],
  ['Ijara', 'Leasing', 'Use of an identified asset is provided for an agreed rental period under documented terms.'],
  ['Mudaraba', 'Profit-sharing investment', 'One party provides capital and another manages the venture, with profit shared by agreement.'],
  ['Musharaka', 'Joint-venture partnership', 'Partners contribute to a commercial venture and share its results under agreed terms.'],
  ['Qard Hasan', 'Benevolent advance', 'A non-interest-bearing advance structured on benevolent terms where appropriate.'],
];

const audiences = [
  { icon: BriefcaseBusiness, title: 'MSMEs', copy: 'Structured access to inventory, productive assets, procurement and project opportunities.' },
  { icon: Users, title: 'Individuals and cooperatives', copy: 'Documented commercial arrangements for real goods, assets and collective ventures.' },
  { icon: Building2, title: 'Corporate organisations', copy: 'Supply, equipment, agency, partnership and project-based trading solutions.' },
];

export default function Home() {
  const { logoUrl } = useCompanyLogo();

  return <div className="home-gradient-bg min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-16 items-center gap-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="NAL General Merchant home">
          <Logo imageUrl={logoUrl} className="h-8 w-8 shrink-0 text-primary" />
          <span className="truncate font-headline text-sm font-bold sm:text-base">NAL General Merchant</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex" aria-label="Main navigation">
          <Link href="#about" className="transition-colors hover:text-primary">About</Link>
          <Link href="#solutions" className="transition-colors hover:text-primary">What we do</Link>
          <Link href="#models" className="transition-colors hover:text-primary">Commercial models</Link>
          <Link href="#contact" className="transition-colors hover:text-primary">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/login"><KeyRound className="mr-2 h-4 w-4" /> Client login</Link>
          </Button>
        </div>
      </div>
    </header>

    <main>
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 -top-16 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="container relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-28">
          <Animated as="div" className="space-y-7">
            <div className="flex flex-wrap items-center gap-4">
              <Image src="/business_hub.png" alt="NAL Business Hub" width={360} height={141} priority className="h-auto w-[220px] sm:w-[285px]" />
              <NonInterestInstitutionMark className="h-14 w-24 border-l border-border/70 pl-4 sm:h-16 sm:w-28" priority />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Trade-based · Asset-backed · Partnership-oriented
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl font-headline text-4xl font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl lg:leading-[1.04]">
                Commerce structured around <span className="text-primary">real assets</span> and shared value.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                NAL General Merchant Limited provides ethical commercial and investment solutions for MSMEs, individuals, cooperatives and organisations through transparent trade, leasing and partnership arrangements.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild><Link href="#solutions">Explore our solutions <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button size="lg" variant="outline" asChild><a href="mailto:info@nalgm.com">Discuss a transaction <Mail className="ml-2 h-4 w-4" /></a></Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Clear commercial terms</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Identifiable assets and projects</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Documented execution</span>
            </div>
          </Animated>

          <Animated as="div" delay={180} className="relative">
            <div className="home-dashboard-preview p-5 sm:p-7">
              <div className="relative flex items-start justify-between gap-4 border-b border-border/70 pb-5">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">NAL operating principle</p><h2 className="mt-2 max-w-md font-headline text-2xl font-bold sm:text-3xl">A real transaction at the centre of every structure.</h2></div>
                <PackageCheck className="h-10 w-10 shrink-0 text-accent" />
              </div>
              <div className="relative mt-6 space-y-3">
                {[
                  ['01', 'Identify the commercial need', 'Goods, equipment, commodities, productive assets or a defined project.'],
                  ['02', 'Select the right structure', 'Purchase and resale, lease, agency, partnership or another suitable commercial model.'],
                  ['03', 'Document and execute', 'Agree the price, responsibilities, delivery, profit-sharing and settlement terms before execution.'],
                ].map(([number, title, copy]) => <div key={number} className="group flex gap-4 rounded-xl border bg-background/75 p-4 transition-colors hover:border-primary/30 hover:bg-background">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">{number}</span>
                  <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy}</p></div>
                </div>)}
              </div>
              <div className="relative mt-5 flex items-start gap-3 rounded-xl bg-slate-950 p-4 text-slate-100 dark:bg-slate-900">
                <Scale className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-sm leading-relaxed"><strong>Commercial—not conventional lending.</strong> NAL does not accept deposits from the public or grant interest-bearing loans.</p>
              </div>
            </div>
          </Animated>
        </div>
      </section>

      <section className="border-b bg-primary text-primary-foreground">
        <div className="container grid gap-0 py-2 sm:grid-cols-3">
          {[
            ['Nigerian private company', 'Limited by shares and established for lawful commercial activity.'],
            ['Non-interest orientation', 'Transactions designed around ethical commercial principles.'],
            ['Real-economy focus', 'Trade, assets, supply, equipment, projects and partnerships.'],
          ].map(([title, copy], index) => <div key={title} className={`px-5 py-5 ${index > 0 ? 'sm:border-l sm:border-primary-foreground/20' : ''}`}><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-primary-foreground/75">{copy}</p></div>)}
        </div>
      </section>

      <section id="about" className="container py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
          <Animated as="div" className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">About NAL</p>
            <h2 className="font-headline text-3xl font-bold tracking-tight sm:text-5xl">A general merchant for modern commercial needs.</h2>
          </Animated>
          <Animated as="div" delay={160} className="space-y-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            <p>NAL General Merchant Limited is established to conduct general merchandising and to structure commercial transactions around identifiable goods, assets and ventures.</p>
            <p>We work across purchase and resale, deferred-payment sales, equipment leasing, procurement, commodity trading, supply-chain arrangements, project activity and partnership ventures. Each engagement is assessed on its commercial substance, documented responsibilities and lawful purpose.</p>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-4"><FileCheck2 className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold text-foreground">Defined terms</p><p className="mt-1 text-sm">The asset, cost, return, delivery and settlement obligations are documented.</p></div>
              <div className="rounded-xl border bg-card p-4"><Handshake className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold text-foreground">Aligned participation</p><p className="mt-1 text-sm">Structures reflect the role, capital and responsibilities of each party.</p></div>
            </div>
          </Animated>
        </div>
      </section>

      <section id="solutions" className="border-y bg-muted/45 py-16 sm:py-24">
        <div className="container">
          <Animated as="div" className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">What we do</p>
            <h2 className="mt-3 font-headline text-3xl font-bold tracking-tight sm:text-5xl">Commercial solutions grounded in real activity.</h2>
            <p className="mt-4 text-lg text-muted-foreground">From a single asset purchase to a structured trading venture, NAL selects a model that fits the underlying transaction.</p>
          </Animated>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {solutions.map((solution, index) => <Animated key={solution.title} as="article" delay={80 + index * 70} className="group rounded-2xl border bg-card/90 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><solution.icon className="h-5 w-5" /></div>
              <h3 className="mt-5 font-headline text-xl font-bold">{solution.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{solution.description}</p>
            </Animated>)}
          </div>
        </div>
      </section>

      <section id="models" className="container py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Animated as="div" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Commercial models</p>
            <h2 className="mt-3 font-headline text-3xl font-bold tracking-tight sm:text-5xl">The structure follows the transaction.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">NAL’s corporate objects provide for recognised trade, lease, partnership and benevolent structures. Availability depends on transaction suitability, approval and complete documentation.</p>
          </Animated>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {commercialModels.map(([name, label, description], index) => <Animated key={name} as="article" delay={index * 60} className="grid gap-3 p-5 sm:grid-cols-[3rem_10rem_1fr] sm:items-start sm:p-6">
              <span className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <div><h3 className="font-headline text-lg font-bold text-primary">{name}</h3><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p></div>
              <p className="leading-relaxed text-muted-foreground">{description}</p>
            </Animated>)}
          </div>
        </div>
      </section>

      <section className="border-y bg-slate-950 py-16 text-slate-100 dark:bg-slate-900 sm:py-20">
        <div className="container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
          <Animated as="div"><p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Our regulatory boundary</p><h2 className="mt-3 font-headline text-3xl font-bold sm:text-4xl">Clear about what NAL is—and what it is not.</h2></Animated>
          <Animated as="div" delay={160} className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5"><CheckCircle2 className="h-6 w-6 text-emerald-400" /><h3 className="mt-4 font-semibold">NAL is</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">A private general-merchant company conducting lawful trade, leasing, agency, asset and partnership transactions.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5"><ShieldCheck className="h-6 w-6 text-amber-300" /><h3 className="mt-4 font-semibold">NAL is not</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">A bank, microfinance bank or finance company. NAL does not accept public deposits or offer interest-bearing loans.</p></div>
          </Animated>
        </div>
      </section>

      <section className="container py-16 sm:py-24">
        <Animated as="div" className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Who we serve</p><h2 className="mt-3 font-headline text-3xl font-bold sm:text-5xl">Built around productive commerce.</h2></Animated>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {audiences.map((audience, index) => <Animated key={audience.title} as="article" delay={index * 100} className="rounded-2xl border bg-card p-6 text-center"><audience.icon className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-4 font-headline text-xl font-bold">{audience.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{audience.copy}</p></Animated>)}
        </div>
      </section>

      <section id="contact" className="container pb-16 sm:pb-24">
        <div className="overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-2xl shadow-primary/15">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-7 sm:p-10 lg:p-12"><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Start a conversation</p><h2 className="mt-3 max-w-xl font-headline text-3xl font-bold sm:text-5xl">Bring us the commercial need. We’ll help assess the right structure.</h2><p className="mt-5 max-w-xl text-lg leading-relaxed text-primary-foreground/75">Every transaction is subject to assessment, approval, documentation and applicable legal requirements.</p><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button size="lg" variant="secondary" asChild><a href="mailto:info@nalgm.com">Email NAL <Mail className="ml-2 h-4 w-4" /></a></Button><Button size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" asChild><a href="tel:+2348032869067">Call us <Phone className="ml-2 h-4 w-4" /></a></Button></div></div>
            <div className="border-t border-primary-foreground/15 bg-black/10 p-7 sm:p-10 lg:border-l lg:border-t-0 lg:p-12"><h3 className="font-headline text-xl font-bold">NAL General Merchant Limited</h3><div className="mt-6 space-y-5 text-sm text-primary-foreground/80"><a href="mailto:info@nalgm.com" className="flex gap-3 hover:text-primary-foreground"><Mail className="mt-0.5 h-4 w-4 shrink-0" /><span>info@nalgm.com</span></a><a href="tel:+2348032869067" className="flex gap-3 hover:text-primary-foreground"><Phone className="mt-0.5 h-4 w-4 shrink-0" /><span>+234 (0) 803 286 9067<br />+234 (0) 803 205 6880</span></a><div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Centre Road, Kano State, Nigeria.</span></div></div></div>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t bg-background">
      <div className="container grid gap-8 py-10 md:grid-cols-[1fr_auto] md:items-end">
        <div><div className="flex items-center gap-3"><Logo imageUrl={logoUrl} className="h-8 w-8 text-primary" /><div><p className="font-headline font-bold">NAL General Merchant Limited</p><p className="text-xs text-muted-foreground">Trade-based · Asset-backed · Partnership-oriented</p></div></div><p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">A private company limited by shares. Commercial arrangements are subject to assessment, approval, documentation and applicable Nigerian law.</p></div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><Link href="/login" className="hover:text-primary">Client login</Link><Link href="/terms" className="hover:text-primary">Terms</Link><Link href="/privacy" className="hover:text-primary">Privacy</Link></div>
      </div>
      <div className="border-t"><div className="container flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} NAL General Merchant Limited. All rights reserved.</p><p>Business operations supported by the NAL digital platform.</p></div></div>
    </footer>
  </div>;
}
