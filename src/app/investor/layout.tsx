
'use client';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Wallet, Banknote, FlaskConical, HelpCircle, BookOpen, History, Settings } from "lucide-react";
import { Logo } from "@/components/icons";
import Link from "next/link";
import { useUser } from "@/firebase";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/firebase/provider";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCompanyLogo } from "@/components/company-logo-provider";
import { MessagesLink } from "@/components/messages-link";
import { OnboardingTourProvider, useOnboardingTour } from "@/components/onboarding-tour";
import { DigitalClock } from "@/components/digital-clock";
import { canAccessPortal, getDefaultRouteForUser } from "@/lib/access-control";
import { RoleSwitcher } from "@/components/role-switcher";
import { AdminShortcut } from "@/components/admin-shortcut";
import { clearStoredActivePortal, resolvePreferredPortal, setStoredActivePortal } from "@/lib/active-portal";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

function InvestorSkeleton() {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <header className="flex h-16 items-center justify-between border-b px-6">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8 rounded-full" />
        </header>
        <main className="flex-1 p-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
            </div>
             <Skeleton className="h-64 w-full rounded-lg mt-6" />
        </main>
      </div>
    );
}

const investorOnboardingSteps = [
  {
    icon: Wallet,
    title: 'Welcome, Investor!',
    description: "This is your personal hub to track your portfolio value, view your investable balance, and see your overall return on investment.",
  },
  {
    icon: Banknote,
    title: 'Deposit and Withdraw',
    description: "Use the 'Request Deposit' button to add funds. When your profits are available, you can request a withdrawal or choose to reinvest them.",
  },
];

const investorNavItems = [
  { href: "/investor/dashboard", label: "Home", icon: Wallet },
  { href: "/investor/transactions", label: "Activity", icon: History },
  { href: "/investor/financing-modes", label: "Modes", icon: BookOpen },
  { href: "/investor/analyzer", label: "Analyzer", icon: FlaskConical },
  { href: "/investor/settings", label: "Settings", icon: Settings },
];

function InvestorMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_hsla(var(--primary)/0.14)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {investorNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
                active && "bg-primary/10 text-primary shadow-sm shadow-primary/10"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AccountMenu() {
    const { user } = useUser();
    const auth = useAuth();
    const router = useRouter();
    const { showTour } = useOnboardingTour();

    const handleLogout = async () => {
        if (auth) {
            clearStoredActivePortal(user?.uid);
            await auth.signOut();
        }
        router.push('/login');
    };

    return (
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/128/128`} alt={user?.displayName ?? ''} />
                  <AvatarFallback>{user?.displayName?.charAt(0) ?? user?.email?.charAt(0)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
               <DropdownMenuItem asChild>
                <Link href="/investor/dashboard">Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/investor/transactions">Transactions</Link>
              </DropdownMenuItem>
               <DropdownMenuItem asChild>
                <Link href="/investor/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showTour} className="flex items-center gap-2 cursor-pointer"><HelpCircle className="h-4 w-4" /><span>Show Tour</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
    )
}

export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useUser();
  const router = useRouter();
  const { logoUrl, loading: logoLoading } = useCompanyLogo();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user) {
      if (!canAccessPortal(user, 'investor')) {
        const preferredPortal = resolvePreferredPortal(user, user.uid);
        router.push(getDefaultRouteForUser(user, preferredPortal));
        return;
      }
      setStoredActivePortal('investor', user.uid);
    }
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <InvestorSkeleton />;
  }

  return (
    <OnboardingTourProvider steps={investorOnboardingSteps} storageKey="hasSeenInvestorTour">
        <div className="app-shell flex w-full flex-col">
            <header className="app-topbar sticky top-0 z-10 flex h-16 items-center gap-2 px-3 lg:gap-4 lg:px-6">
                <Link href="/investor/dashboard" className="flex min-w-0 items-center gap-2 font-bold font-headline text-primary">
                <Logo imageUrl={logoUrl} className="h-7 w-7" />
                <span className="text-sm lg:text-base">
                  <span className="lg:hidden">NAL</span>
                  <span className="hidden lg:inline">NAL General Marchant</span>
                </span>
                </Link>
                <div className="flex-1" />
                <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
                    <Button variant="ghost" asChild>
                        <Link href="/investor/dashboard">
                            <Wallet className="h-4 w-4 mr-2" />
                            Dashboard
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/investor/transactions">
                            <History className="h-4 w-4 mr-2" />
                            Transactions
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/investor/financing-modes">
                            <BookOpen className="h-4 w-4 mr-2" />
                            Financing Modes
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/investor/analyzer">
                            <FlaskConical className="h-4 w-4 mr-2" />
                            Analyzer
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/investor/settings">
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                        </Link>
                    </Button>
                </nav>
                <div className="hidden lg:block">
                  <DigitalClock />
                </div>
                <div className="hidden lg:block">
                  <AdminShortcut currentPortal="investor" />
                </div>
                <RoleSwitcher currentPortal="investor" />
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
                <MessagesLink basePath="/investor" />
                <NotificationBell historyHref="/investor/notifications" />
                <AccountMenu />
            </header>
            <main className="app-content flex-1 p-4 pb-24 lg:p-6">{children}</main>
            <InvestorMobileNav />
        </div>
    </OnboardingTourProvider>
  );
}
