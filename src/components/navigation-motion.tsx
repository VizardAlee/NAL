'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motionEase } from '@/lib/presentation-motion';

export function NavigationMotion() {
  const pathname = usePathname();
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    let animation: Animation | undefined;
    let observer: MutationObserver | undefined;
    const cancel = () => animation?.cancel();
    const enter = () => {
      const title = document.querySelector('#main-content [data-page-intro], #main-content h1, #main-content [data-motion-title]');
      if (!title) return false;
      animation = title.animate([{ opacity: 0.65, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: motionEase });
      observer?.disconnect();
      return true;
    };
    if (!enter()) {
      observer = new MutationObserver(enter);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    const stop = () => { cancel(); observer?.disconnect(); };
    preference.addEventListener('change', stop);
    window.addEventListener('beforeprint', stop);
    window.addEventListener('pagehide', stop);
    return () => {
      stop(); preference.removeEventListener('change', stop);
      window.removeEventListener('beforeprint', stop); window.removeEventListener('pagehide', stop);
    };
  }, [pathname]);
  return null;
}
