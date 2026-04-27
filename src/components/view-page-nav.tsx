'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import Link from 'next/link';

type ViewPageNavProps = {
  homePath: string;
};

export function ViewPageNav({ homePath }: ViewPageNavProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Button data-owner-write-exempt="true" variant="outline" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <Button data-owner-write-exempt="true" variant="outline" size="sm" asChild>
        <Link href={homePath}>
          <Home className="mr-2 h-4 w-4" />
          Home
        </Link>
      </Button>
    </div>
  );
}
