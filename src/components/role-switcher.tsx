'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import {
  getAccessiblePortals,
  getRouteForPortal,
  type PrimaryPortal,
} from '@/lib/access-control';
import { setStoredActivePortal } from '@/lib/active-portal';

const PORTAL_LABELS: Record<PrimaryPortal, string> = {
  owner: 'Owner',
  admin: 'Admin',
  investor: 'Investor',
  client: 'Client',
  legal: 'Legal',
  recovery: 'Recovery',
  marketer: 'Marketer',
};

type RoleSwitcherProps = {
  currentPortal: PrimaryPortal;
};

export function RoleSwitcher({ currentPortal }: RoleSwitcherProps) {
  const { user } = useUser();
  const router = useRouter();

  const accessiblePortals = useMemo(() => getAccessiblePortals(user), [user]);

  if (accessiblePortals.length <= 1) {
    return null;
  }

  const handleSwitch = (portal: PrimaryPortal) => {
    if (portal === currentPortal) return;
    setStoredActivePortal(portal, user?.uid);
    router.push(getRouteForPortal(portal));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          {PORTAL_LABELS[currentPortal]}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {accessiblePortals.map((portal) => (
          <DropdownMenuItem
            key={portal}
            onClick={() => handleSwitch(portal)}
            disabled={portal === currentPortal}
            className="cursor-pointer"
          >
            {PORTAL_LABELS[portal]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
