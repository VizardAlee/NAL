'use client';

import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import {
  getAccessiblePortals,
  getRouteForPortal,
  canViewAdmin,
  type PrimaryPortal,
} from '@/lib/access-control';
import { setStoredActivePortal } from '@/lib/active-portal';
import { useMemo } from 'react';

type AdminShortcutProps = {
  currentPortal: PrimaryPortal;
};

export function AdminShortcut({ currentPortal }: AdminShortcutProps) {
  const { user } = useUser();
  const router = useRouter();

  const accessiblePortals = useMemo(() => getAccessiblePortals(user), [user]);
  const hasAdminAccess = useMemo(() => canViewAdmin(user), [user]);

  // If already in admin portal, don't show the shortcut to admin dashboard
  if (currentPortal === 'admin') {
    return null;
  }

  if (!hasAdminAccess || accessiblePortals.length <= 1) {
    return null;
  }

  const handleGoToAdmin = () => {
    setStoredActivePortal('admin');
    router.push(getRouteForPortal('admin'));
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleGoToAdmin}
      className="hidden md:flex items-center gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 hover:scale-105 active:scale-95"
    >
      <LayoutDashboard className="h-4 w-4 text-primary animate-pulse" />
      <span className="font-medium">Admin Dashboard</span>
    </Button>
  );
}
