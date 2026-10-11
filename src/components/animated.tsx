'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { viewportEntrance } from '@/lib/presentation-motion';

type AnimatedProps = React.HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean; as?: React.ElementType; delay?: number; threshold?: number;
};

export function Animated({ asChild, as: Tag = 'div', className, children,
  delay = 0, threshold = 0.08, ...props }: AnimatedProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return viewportEntrance(ref.current, { delay, threshold, duration: 700,
      keyframes: [{ opacity: 0.15, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }],
    });
  }, [delay, threshold]);
  const Comp = asChild ? Slot : Tag;
  // Visible in SSR and without JS; only animate once the section enters the viewport.
  return <Comp ref={ref} className={cn('nal-reveal', className)} {...props}>{children}</Comp>;
}
