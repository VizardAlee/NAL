'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Crown, LayoutDashboard, LogOut, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/icons';
import { DigitalClock } from '@/components/digital-clock';
import { useCompanyLogo } from '@/components/company-logo-provider';
import { NonInterestInstitutionMark } from '@/components/non-interest-institution-mark';
import { useAuth } from '@/firebase/provider';
import { useUser } from '@/firebase';
import { getDefaultRouteForUser, normalizeAccessModel } from '@/lib/access-control';
import { RoleSwitcher } from '@/components/role-switcher';
import { AdminShortcut } from "@/components/admin-shortcut";
import { clearStoredActivePortal, resolvePreferredPortal, setStoredActivePortal } from '@/lib/active-portal';
import { NotificationBell } from '@/components/notification-bell';

function OwnerSkeleton() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </header>
      <main className="flex-1 p-6">
        <Skeleton className="mb-6 h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </main>
    </div>
  );
}

function AccountMenu() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleOpenAdmin = () => {
    setStoredActivePortal('admin', user?.uid);
    router.push('/admin/dashboard');
  };

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
        <DropdownMenuLabel>Owner Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleOpenAdmin} className="flex items-center gap-2 cursor-pointer">
          <Shield className="h-4 w-4" />
          <span>Open Admin (Read-only)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const { logoUrl, loading: logoLoading } = useCompanyLogo();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user) {
      const model = normalizeAccessModel(user as any);
      if (model.accessRole !== 'OWNER') {
        const preferredPortal = resolvePreferredPortal(user, user.uid);
        router.push(getDefaultRouteForUser(user as any, preferredPortal));
        return;
      }
      setStoredActivePortal('owner', user.uid);
    }
  }, [user, loading, router]);

  if (loading || !user || logoLoading) {
    return <OwnerSkeleton />;
  }

  return (
    <div className="app-shell flex w-full flex-col">
      <header className="app-topbar sticky top-0 z-10 flex h-16 items-center gap-2 px-3 lg:gap-4 lg:px-6">
        <Link href="/owner/dashboard" className="flex min-w-0 items-center gap-2 font-bold font-headline text-primary">
          <Logo imageUrl={logoUrl} className="h-7 w-7" />
          <span className="text-sm lg:text-base">
            <span className="lg:hidden">NAL</span>
            <span className="hidden lg:inline">Owner Console</span>
          </span>
        </Link>
        <NonInterestInstitutionMark className="h-8 w-14 border-l border-border pl-2 lg:h-10 lg:w-[4.5rem]" />
        <div className="flex-1" />
        <nav className="hidden items-center gap-2 text-sm font-medium lg:flex">
          <Button variant="ghost" asChild>
            <Link href="/owner/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </nav>
        <div className="hidden lg:block">
          <DigitalClock />
        </div>
        <div className="hidden lg:block">
          <AdminShortcut currentPortal="owner" />
        </div>
        <RoleSwitcher currentPortal="owner" />
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        <NotificationBell historyHref="/owner/notifications" />
        <AccountMenu />
      </header>
      <main className="app-content flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
