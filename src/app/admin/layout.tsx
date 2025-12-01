
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
import { Bell, LogOut, Circle } from "lucide-react";
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
import { useUser, useCollection } from "@/firebase";
import { useRouter } from "next/navigation";
import { useAuth, useFirestore } from "@/firebase/provider";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { collection, query, orderBy, limit, doc, updateDoc, Timestamp, where, writeBatch, getDocs } from "firebase/firestore";
import { formatDistanceToNow } from 'date-fns';
import { useCompanyLogo } from "@/components/company-logo-provider";
import { usePathname } from 'next/navigation';


type Notification = {
    id: string;
    title: string;
    message: string;
    link: string;
    read: boolean;
    createdAt: Timestamp;
};

// New hook to clear notifications when a page is visited
function useClearNotificationsByPath() {
    const firestore = useFirestore();
    const pathname = usePathname();

    useEffect(() => {
        if (!firestore || !pathname) return;

        const clearNotifications = async () => {
            const notificationsToClearQuery = query(
                collection(firestore, 'notifications'),
                where('link', '==', pathname),
                where('read', '==', false)
            );
            
            const snapshot = await getDocs(notificationsToClearQuery);
            if (snapshot.empty) return;

            const batch = writeBatch(firestore);
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            
            await batch.commit();
        };

        // Debounce or delay slightly to avoid race conditions on rapid navigation
        const timer = setTimeout(clearNotifications, 500);

        return () => clearTimeout(timer);

    }, [firestore, pathname]);
}


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

function NotificationBell() {
    const firestore = useFirestore();
    const router = useRouter();

    const notificationsQuery = useMemo(() => {
        if (!firestore) return null;
        // Only fetch unread notifications to keep the list clean
        return query(collection(firestore, 'notifications'), where('read', '==', false), orderBy('createdAt', 'desc'), limit(10));
    }, [firestore]);

    const { data: notifications } = useCollection<Notification>(notificationsQuery);

    const handleNotificationClick = async (notification: Notification) => {
        if (!firestore) return;
        // Mark as read optimistic update
        const notifRef = doc(firestore, 'notifications', notification.id);
        await updateDoc(notifRef, { read: true });
        router.push(notification.link);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full relative">
                    <Bell className="h-5 w-5" />
                    {notifications && notifications.length > 0 && (
                        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                    )}
                    <span className="sr-only">Toggle notifications</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications && notifications.length > 0 ? (
                    notifications.map(n => (
                        <DropdownMenuItem key={n.id} onClick={() => handleNotificationClick(n)} className="flex items-start gap-3 cursor-pointer">
                           {!n.read && <Circle className="h-2 w-2 mt-1.5 fill-primary text-primary" />}
                           {n.read && <div className="w-2 h-2" />}
                            <div className="grid gap-1">
                                <p className="font-medium">{n.title}</p>
                                <p className="text-xs text-muted-foreground">{n.message}</p>
                                <p className="text-xs text-muted-foreground">{formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })}</p>
                            </div>
                        </DropdownMenuItem>
                    ))
                ) : (
                    <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
                )}
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
  const auth = useAuth();
  const router = useRouter();
  const { logoUrl, loading: logoLoading } = useCompanyLogo();

  // Initialize the hook here
  useClearNotificationsByPath();

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
  }, [user, loading, router]);
  

  if (loading || !user || logoLoading) {
    return <AdminSkeleton />;
  }

  return (
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
          <ThemeToggle />
          <NotificationBell />
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
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
