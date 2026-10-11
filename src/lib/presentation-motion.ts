// Motion changes presentation only; the DOM and all values remain immediately available.
export const motionEase = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function viewportEntrance(element: Element, options: {
  selector?: string; delay?: number; duration?: number; threshold?: number; easing?: string;
  keyframes: Keyframe[];
}) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations: Animation[] = [];
  let entered = false;
  let observer: IntersectionObserver | undefined;
  let children: MutationObserver | undefined;
  const cancel = () => animations.forEach(animation => animation.cancel());
  const stop = () => { entered = true; observer?.disconnect(); children?.disconnect(); cancel(); };
  const reveal = () => {
    if (entered || preference.matches) return;
    const targets = options.selector ? [...element.querySelectorAll(options.selector)] : [element];
    if (!targets.length) return; // Responsive charts may render after their first size measurement.
    entered = true;
    observer?.disconnect(); children?.disconnect();
    targets.forEach(target => animations.push(target.animate(options.keyframes, {
      duration: options.duration ?? 650, delay: Math.min(options.delay ?? 0, 160),
      easing: options.easing ?? motionEase, fill: 'backwards',
    })));
  };
  if (!preference.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        reveal();
        if (!entered && options.selector) {
          children = new MutationObserver(reveal);
          children.observe(element, { childList: true, subtree: true });
        }
      } else { children?.disconnect(); }
    }, { threshold: options.threshold ?? 0.08, rootMargin: '0px 0px -24px 0px' });
    observer.observe(element);
  }
  const onPreference = () => { if (preference.matches) stop(); };
  preference.addEventListener('change', onPreference);
  window.addEventListener('pagehide', stop);
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) stop(); };
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('beforeprint', stop);
  element.addEventListener('focusin', stop); // Keyboard navigation never waits for a reveal.
  return () => {
    stop();
    preference.removeEventListener('change', onPreference);
    window.removeEventListener('pagehide', stop);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('beforeprint', stop);
    element.removeEventListener('focusin', stop);
  };
}
