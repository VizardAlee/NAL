
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
  Database,
  FilePlus,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const menuItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/deals", label: "Deals", icon: FileText },
  { href: "/admin/users", label: "Users", icon: Users },
  {
    label: "Approvals",
    icon: CheckCircle,
    subItems: [
      { href: "/admin/approvals/deal-requests", label: "Deal Requests", icon: FilePlus },
      { href: "/admin/approvals/withdrawals", label: "Withdrawals" },
      { href: "/admin/approvals/reinvestments", label: "Reinvestments" },
      { href: "/admin/approvals/repayments", label: "Repayments" },
      { href: "/admin/approvals/terminations", label: "Terminations" },
    ],
  },
  { href: "/admin/funds", label: "Funds", icon: Banknote },
  { href: "/admin/analyzer", label: "Analyzer", icon: FlaskConical },
  { href: "/admin/activity", label: "Activity", icon: History },
  { href: "/admin/migration", label: "Data Migration", icon: Database },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  const [openCollapsibles, setOpenCollapsibles] = React.useState<string[]>([]);

  React.useEffect(() => {
    const activeCollapsible = menuItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    if (activeCollapsible) {
      setOpenCollapsibles(prev => [...new Set([...prev, activeCollapsible.label])]);
    }
  }, [pathname]);

  return (
    <SidebarMenu>
      {menuItems.map((item) =>
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
                        <Link href={subItem.href}>
                          {subItem.icon && <subItem.icon />}
                          <span>{subItem.label}</span>
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
            >
              <Link href={item.href}>
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  );
}
