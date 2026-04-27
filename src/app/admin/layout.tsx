
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
import { LogOut, LayoutDashboard, FileText, Users, CheckCircle, HelpCircle, Shield } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AdminNav } from "@/components/admin-nav";
import { Logo } from "@/components/icons";
import Link from "next/link";
import { useUser } from "@/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/firebase/provider";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCompanyLogo } from "@/components/company-logo-provider";
import { OnboardingTourProvider, useOnboardingTour } from "@/components/onboarding-tour";
import { DigitalClock } from "@/components/digital-clock";
import { MessagesLink } from "@/components/messages-link";
import { canAccessPortal, getDefaultRouteForUser, isReadOnlyOwner } from "@/lib/access-control";
import { RoleSwitcher } from "@/components/role-switcher";
import { resolvePreferredPortal, setStoredActivePortal } from "@/lib/active-portal";
import { NotificationBell } from "@/components/notification-bell";


function AdminSkeleton() {
    return (
      <div className="flex h-screen w-full">
        <div className="hidden md:flex flex-col w-64 border-r p-4 gap-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-col gap-2 mt-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
        </div>
        <div className="flex-1">
            <header className="flex items-center h-16 border-b px-6 justify-end">
                <Skeleton className="h-8 w-8 rounded-full" />
            </header>
            <main className="p-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="mt-4 h-64 w-full" />
            </main>
        </div>
      </div>
    );
}

const adminOnboardingSteps = [
  {
    icon: LayoutDashboard,
    title: 'Welcome to Your Dashboard',
    description: "This is your command center. Get a high-level overview of platform metrics, from total value locked to recent user activity.",
  },
  {
    icon: CheckCircle,
    title: 'Manage Approvals',
    description: "All user requests, from new deals and deposits to withdrawals and terminations, appear in the 'Approvals' section for your review.",
  },
  {
    icon: Users,
    title: 'Oversee Users',
    description: "The 'Users' section allows you to view profiles and financial histories for every investor and client on the platform.",
  },
  {
    icon: FileText,
    title: 'Handle Deals',
    description: "Create, view, and manage all financing deals. Once a deal is ready, you can activate it by funding it from available capital.",
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
              <DropdownMenuItem asChild><Link href="/admin/settings">Settings</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={showTour} className="flex items-center gap-2 cursor-pointer"><HelpCircle className="h-4 w-4" /><span>Show Tour</span></DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://wa.me/2347032545288" target="_blank" rel="noopener noreferrer">Support</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
    )
}


export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useUser();
  const router = useRouter();
  const { logoUrl, loading: logoLoading } = useCompanyLogo();
  const ownerReadOnly = isReadOnlyOwner(user);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user) {
      if (!canAccessPortal(user, 'admin')) {
        const preferredPortal = resolvePreferredPortal(user);
        router.push(getDefaultRouteForUser(user, preferredPortal));
        return;
      }
      setStoredActivePortal('admin');
    }
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <AdminSkeleton />;
  }

  return (
    <OnboardingTourProvider steps={adminOnboardingSteps} storageKey="hasSeenAdminTour">
        <SidebarProvider>
        <Sidebar>
            <SidebarHeader>
            <div className="flex items-center gap-2 p-2">
                <Link href="/admin/dashboard" className="flex items-center gap-2">
                <Logo imageUrl={logoUrl} className="h-7 w-7 text-primary" />
                <span className="text-lg font-bold font-headline text-primary group-data-[collapsible=icon]:hidden">
                    NAL General Marchant
                </span>
                </Link>
            </div>
            </SidebarHeader>
            <SidebarContent>
            <AdminNav />
            </SidebarContent>
            <SidebarFooter>
            {/* Future footer content */}
            </SidebarFooter>
        </Sidebar>
        <SidebarInset>
            <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex-1">
                {/* Mobile sidebar trigger */}
                <SidebarTrigger className="md:hidden" />
            </div>
            <DigitalClock />
            <RoleSwitcher currentPortal="admin" />
            <ThemeToggle />
            <MessagesLink basePath="/admin" />
            <NotificationBell historyHref="/admin/notifications" />
            <AccountMenu />
            </header>
            {ownerReadOnly && (
              <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>You are viewing the Admin portal as an Owner. Admin actions are read-only.</span>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/owner/dashboard">Return to Owner Console</Link>
                  </Button>
                </div>
              </div>
            )}
            <main className={`flex-1 p-4 md:p-6 ${ownerReadOnly ? 'owner-readonly' : ''}`}>{children}</main>
        </SidebarInset>
        </SidebarProvider>
    </OnboardingTourProvider>
  );
}
