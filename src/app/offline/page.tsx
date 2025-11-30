'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md">
        <WifiOff className="mx-auto h-16 w-16 text-destructive" />
        <h1 className="mt-6 text-3xl font-bold font-headline text-foreground">
          You are Offline
        </h1>
        <p className="mt-4 text-muted-foreground">
          It looks like you've lost your internet connection. Please check your network settings and try again.
        </p>
        <Button
          onClick={() => window.location.reload()}
          className="mt-8"
          size="lg"
        >
          Retry Connection
        </Button>
      </div>
    </div>
  );
}
