
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
import { LogOut, FileText, PlusCircle } from "lucide-react";
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
import { OnboardingTour, OnboardingStep } from "@/components/onboarding-tour";

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

const clientOnboardingSteps: OnboardingStep[] = [
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


export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { logoUrl, loading: logoLoading } = useCompanyLogo();

  const handleLogout = async () => {
    if (auth) {
        await auth.signOut();
    }
    router.push('/login');
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    // Add a check for user role if necessary
    // Example: fetch user doc and redirect if role is not 'Client'
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <ClientSkeleton />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
        <OnboardingTour steps={clientOnboardingSteps} storageKey="hasSeenClientTour" />
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
            <Link href="/client/dashboard" className="flex items-center gap-2 font-bold font-headline text-primary">
              <Logo imageUrl={logoUrl} className="h-7 w-7" />
              <span>NAL General Marchant</span>
            </Link>
            <div className="flex-1" />
            <ThemeToggle />
            <MessagesLink basePath="/client" />
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
              <DropdownMenuItem asChild><Link href="/client/settings">Settings</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
