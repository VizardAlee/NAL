
'use client';

import React from 'react';
import { useInView } from 'react-intersection-observer';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';

type AnimatedProps = React.HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  as?: React.ElementType;
  delay?: number;
  threshold?: number;
  triggerOnce?: boolean;
};

export function Animated({
  asChild,
  as: Tag = 'div',
  className,
  children,
  delay = 0,
  threshold = 0.3,
  triggerOnce = true,
  ...props
}: AnimatedProps) {
  const { ref, inView } = useInView({
    threshold,
    triggerOnce,
  });

  const Comp = asChild ? Slot : Tag;

  return (
    <Comp
      ref={ref}
      className={cn(
        'transition-all duration-700',
        inView
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4',
        className
      )}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      {...props}
    >
      {children}
    </Comp>
  );
}
