
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
import { LogOut, Wallet, Banknote, FlaskConical, HelpCircle, BookOpen } from "lucide-react";
import { Logo } from "@/components/icons";
import Link from "next/link";
import { useUser } from "@/firebase";
import { useRouter } from "next/navigation";
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
import { resolvePreferredPortal, setStoredActivePortal } from "@/lib/active-portal";

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

function AccountMenu() {
    const { user } = useUser();
    const auth = useAuth();
    const router = useRouter();
    const { showTour } = useOnboardingTour();

    const handleLogout = async () => {
        if (auth) {
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
        const preferredPortal = resolvePreferredPortal(user);
        router.push(getDefaultRouteForUser(user, preferredPortal));
        return;
      }
      setStoredActivePortal('investor');
    }
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <InvestorSkeleton />;
  }

  return (
    <OnboardingTourProvider steps={investorOnboardingSteps} storageKey="hasSeenInvestorTour">
        <div className="flex min-h-screen w-full flex-col">
            <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
                <Link href="/investor/dashboard" className="flex items-center gap-2 font-bold font-headline text-primary">
                <Logo imageUrl={logoUrl} className="h-7 w-7" />
                <span>NAL General Marchant</span>
                </Link>
                <div className="flex-1" />
                <nav className="flex items-center gap-2 text-sm font-medium">
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
                </nav>
                <DigitalClock />
                <RoleSwitcher currentPortal="investor" />
                <ThemeToggle />
                <MessagesLink basePath="/investor" />
                <AccountMenu />
            </header>
            <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
    </OnboardingTourProvider>
  );
}
