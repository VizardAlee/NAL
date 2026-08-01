
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
import { LogOut, FileText, PlusCircle, FlaskConical, HelpCircle, BookOpen, History, Settings } from "lucide-react";
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

function ClientSkeleton() {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <header className="flex h-16 items-center justify-between border-b px-6">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8 rounded-full" />
        </header>
        <main className="flex-1 p-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-lg" />
            </div>
        </main>
      </div>
    );
}

const clientOnboardingSteps = [
  {
    icon: FileText,
    title: 'Welcome, Client!',
    description: "This is your dashboard where you can manage your financing deals, track repayment schedules, and communicate with administrators.",
  },
  {
    icon: PlusCircle,
    title: 'Request a New Deal',
    description: "Need new financing? Use the 'Request a Deal' button to submit a new proposal for review by our administrative team.",
  },
];

const clientNavItems = [
  { href: "/client/dashboard", label: "Home", icon: FileText },
  { href: "/client/deals", label: "Deals", icon: History },
  { href: "/client/deals/request", label: "Request", icon: PlusCircle },
  { href: "/client/financing-modes", label: "Modes", icon: BookOpen },
  { href: "/client/settings", label: "Settings", icon: Settings },
];

function ClientMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_hsla(var(--primary)/0.14)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {clientNavItems.map((item) => {
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
                  <AvatarImage src={user?.photoURL} alt={user?.displayName ?? ''} />
                  <AvatarFallback>{user?.displayName?.charAt(0) ?? user?.email?.charAt(0)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/client/settings">Settings</Link></DropdownMenuItem>
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

export default function ClientLayout({
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
      if (!canAccessPortal(user, 'client')) {
        const preferredPortal = resolvePreferredPortal(user, user.uid);
        router.push(getDefaultRouteForUser(user, preferredPortal));
        return;
      }
      setStoredActivePortal('client', user.uid);
    }
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <ClientSkeleton />;
  }

  return (
    <OnboardingTourProvider steps={clientOnboardingSteps} storageKey="hasSeenClientTour">
        <div className="app-shell flex w-full flex-col">
            <header className="app-topbar sticky top-0 z-10 flex h-16 items-center gap-2 px-3 lg:gap-4 lg:px-6">
                <Link href="/client/dashboard" className="flex min-w-0 items-center gap-2 font-bold font-headline text-primary">
                <Logo imageUrl={logoUrl} className="h-7 w-7" />
                <span className="text-sm lg:text-base">
                  <span className="lg:hidden">NAL</span>
                  <span className="hidden lg:inline">NAL General Marchant</span>
                </span>
                </Link>
                <div className="flex-1" />
                <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
                    <Button variant="ghost" asChild>
                        <Link href="/client/dashboard">
                            <FileText className="h-4 w-4 mr-2" />
                            Dashboard
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/client/deals">
                            <History className="h-4 w-4 mr-2" />
                            All Deals
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/client/financing-modes">
                            <BookOpen className="h-4 w-4 mr-2" />
                            Financing Modes
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/client/analyzer">
                            <FlaskConical className="h-4 w-4 mr-2" />
                            Analyzer
                        </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/client/settings">
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                        </Link>
                    </Button>
                </nav>
                <div className="hidden lg:block">
                  <DigitalClock />
                </div>
                <div className="hidden lg:block">
                  <AdminShortcut currentPortal="client" />
                </div>
                <RoleSwitcher currentPortal="client" />
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
                <MessagesLink basePath="/client" />
                <NotificationBell historyHref="/client/notifications" />
                <AccountMenu />
            </header>
            <main className="app-content flex-1 p-4 pb-24 lg:p-6">{children}</main>
            <ClientMobileNav />
        </div>
    </OnboardingTourProvider>
  );
}
