'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function DigitalClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // Set initial time on client mount
    setTime(new Date());

    // Update time every second
    const timerId = setInterval(() => {
      setTime(new Date());
    }, 1000);

    // Cleanup interval on component unmount
    return () => {
      clearInterval(timerId);
    };
  }, []); // Empty dependency array ensures this runs once on mount

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };
  
  if (!time) {
      return (
          <div className="flex items-center justify-center rounded-md bg-muted px-4 py-2 h-8 w-[110px]">
              <span className="font-mono text-sm text-muted-foreground opacity-50">--:--:-- --</span>
          </div>
      );
  }

  return (
    <div className="flex items-center justify-center rounded-md bg-muted px-4 py-2">
      <span className="font-mono text-sm font-semibold text-muted-foreground tabular-nums">
        {formatTime(time)}
      </span>
    </div>
  );
}
