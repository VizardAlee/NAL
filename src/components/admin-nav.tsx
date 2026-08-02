
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  FileText,
  Users,
  CheckCircle,
  Banknote,
  FlaskConical,
  History,
  Settings,
  ChevronDown,
  FilePlus,
  ShieldAlert,
  Wallet,
  RefreshCcw,
  HandCoins,
  MessageSquarePlus,
  Library,
  Landmark,
  MoreHorizontal,
  FileSignature,
  CalendarSync,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useCollection, useUser } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MenuItem = {
  href?: string;
  label: string;
  icon: React.ElementType;
  subItems?: {
    href: string;
    label: string;
    icon?: React.ElementType;
    notificationCollection?: string;
  }[];
  notificationCollection?: string;
};

export const adminMenuItems: MenuItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/deals", label: "Deals", icon: FileText },
  { href: "/admin/agreements", label: "Agreements", icon: FileSignature },
  { href: "/admin/users", label: "Users", icon: Users },
  {
    label: "Approvals",
    icon: CheckCircle,
    subItems: [
      { href: "/admin/approvals/deal-requests", label: "Deal Requests", icon: FilePlus, notificationCollection: 'dealRequests' },
      { href: "/admin/approvals/deposits", label: "Deposits", icon: Wallet, notificationCollection: 'depositRequests' },
      { href: "/admin/approvals/withdrawals", label: "Withdrawals", icon: HandCoins, notificationCollection: 'withdrawalRequests' },
      { href: "/admin/approvals/reinvestments", label: "Reinvestments", icon: RefreshCcw, notificationCollection: 'reinvestmentRequests' },
      { href: "/admin/approvals/repayments", label: "Repayments", icon: HandCoins, notificationCollection: 'repayments' },
      { href: "/admin/approvals/repayment-changes", label: "Frequency Changes", icon: CalendarSync, notificationCollection: 'repaymentPlanChangeRequests' },
      { href: "/admin/approvals/terminations", label: "Terminations", icon: ShieldAlert, notificationCollection: 'terminationRequests' },
      { href: "/admin/approvals/chat-requests", label: "Chat Requests", icon: MessageSquarePlus, notificationCollection: 'chatRequests' },
    ],
  },
  { href: "/admin/funds", label: "Funds", icon: Banknote },
  { href: "/admin/reports", label: "Reports", icon: Library },
  { href: "/admin/tax", label: "Tax", icon: Landmark },
  { href: "/admin/financing-modes", label: "Financing Modes", icon: Library },
  { href: "/admin/analyzer", label: "Analyzer", icon: FlaskConical },
  { href: "/admin/activity", label: "Activity", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const primaryMobileItems = adminMenuItems.slice(0, 4);
const moreMobileItems = adminMenuItems.slice(4);

function isItemActive(pathname: string, item: MenuItem) {
  if (item.href) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return item.subItems?.some((sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)) ?? false;
}

function NotificationBadge({ collectionName }: { collectionName: string }) {
  const firestore = useFirestore();
  const { user } = useUser();

  const q = React.useMemo(() => {
    if (!firestore || !user) return null;

    // For messages, count open chat requests
    if (collectionName === 'messages') {
      return query(collection(firestore, 'chatRequests'));
    }

    // For other collections with a 'status' field
    if (['dealRequests', 'depositRequests', 'withdrawalRequests', 'reinvestmentRequests', 'repayments', 'repaymentPlanChangeRequests', 'terminationRequests'].includes(collectionName)) {
      return query(collection(firestore, collectionName), where('status', '==', 'Pending'));
    }

    // For chatRequests which has no status
    if (collectionName === 'chatRequests') {
      return query(collection(firestore, collectionName));
    }

    return null;
  }, [firestore, user, collectionName]);

  const { data } = useCollection(q);

  if (!data || data.length === 0) return null;

  return <Badge className="ml-auto">{data.length}</Badge>;
}

export function AdminNav() {
  const pathname = usePathname();
  const [openCollapsibles, setOpenCollapsibles] = React.useState<string[]>([]);

  React.useEffect(() => {
    const activeCollapsible = adminMenuItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    if (activeCollapsible) {
      setOpenCollapsibles(prev => [...new Set([...prev, activeCollapsible.label])]);
    }
  }, [pathname]);

  return (
    <SidebarMenu>
      {adminMenuItems.map((item) =>
        item.subItems ? (
          <SidebarMenuItem key={item.label}>
            <Collapsible
              open={openCollapsibles.includes(item.label)}
              onOpenChange={(isOpen) =>
                setOpenCollapsibles(
                  isOpen
                    ? [...openCollapsibles, item.label]
                    : openCollapsibles.filter((l) => l !== item.label)
                )
              }
              className="w-full"
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  className="w-full justify-between"
                  isActive={item.subItems.some((sub) => pathname.startsWith(sub.href))}
                  variant="default"
                >
                  <div className="flex items-center gap-2">
                    <item.icon />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.subItems.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.href}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={pathname === subItem.href}
                      >
                        <Link href={subItem.href} className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-2">
                            {subItem.icon && <subItem.icon />}
                            <span>{subItem.label}</span>
                          </div>
                          {subItem.notificationCollection && <NotificationBadge collectionName={subItem.notificationCollection} />}
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href}
              tooltip={item.label}
              variant="default"
              className="w-full justify-between"
            >
              <Link href={item.href!} className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2">
                  <item.icon />
                  <span>{item.label}</span>
                </div>
                {item.notificationCollection && <NotificationBadge collectionName={item.notificationCollection} />}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  const moreActive = moreMobileItems.some((item) => isItemActive(pathname, item));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_hsla(var(--primary)/0.14)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item);

          if (item.subItems) {
            return (
              <Sheet key={item.label}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "relative h-14 flex-col gap-1 rounded-md px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
                      active && "bg-primary/10 text-primary shadow-sm shadow-primary/10"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="leading-none">{item.label}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[80svh] rounded-t-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
                  <SheetHeader className="text-left">
                    <SheetTitle>{item.label}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 grid gap-2 overflow-y-auto">
                    {item.subItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const subActive = pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);

                      return (
                        <SheetClose key={subItem.href} asChild>
                          <Link
                            href={subItem.href}
                            className={cn(
                              "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                              subActive ? "bg-primary/10 text-primary shadow-sm shadow-primary/10" : "hover:bg-muted/70 hover:text-foreground"
                            )}
                          >
                            {SubIcon && <SubIcon className="h-5 w-5 shrink-0" />}
                            <span>{subItem.label}</span>
                            {subItem.notificationCollection && <NotificationBadge collectionName={subItem.notificationCollection} />}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
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

        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-14 flex-col gap-1 rounded-md px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
                moreActive && "bg-primary/10 text-primary shadow-sm shadow-primary/10"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="leading-none">More</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82svh] rounded-t-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="text-left">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid gap-4 overflow-y-auto">
              <div className="grid gap-2">
                {moreMobileItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(pathname, item);

                  if (item.subItems) {
                    return (
                      <div key={item.label} className="grid gap-2">
                        <div className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                          <Icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </div>
                        <div className="grid gap-1 pl-5">
                          {item.subItems.map((subItem) => {
                            const SubIcon = subItem.icon;
                            const subActive = pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);

                            return (
                              <SheetClose key={subItem.href} asChild>
                                <Link
                                  href={subItem.href}
                                  className={cn(
                                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                                    subActive ? "bg-primary/10 text-primary shadow-sm shadow-primary/10" : "hover:bg-muted/70 hover:text-foreground"
                                  )}
                                >
                                  {SubIcon && <SubIcon className="h-4 w-4 shrink-0" />}
                                  <span>{subItem.label}</span>
                                  {subItem.notificationCollection && <NotificationBadge collectionName={subItem.notificationCollection} />}
                                </Link>
                              </SheetClose>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <SheetClose key={item.href} asChild>
                      <Link
                        href={item.href!}
                        className={cn(
                          "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                          active ? "bg-primary/10 text-primary shadow-sm shadow-primary/10" : "hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                        {item.notificationCollection && <NotificationBadge collectionName={item.notificationCollection} />}
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
