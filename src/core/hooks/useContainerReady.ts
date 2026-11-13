import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Observes a container element and returns `true` once it has non-zero layout dimensions.
 * Replaces `setInterval` polling of `offsetWidth/offsetHeight` so hidden tabs do not
 * trigger continuous forced layout reflows.
 */
export function useContainerReady<T extends HTMLElement = HTMLDivElement>(): {
  containerRef: RefObject<T | null>;
  isMounted: boolean;
} {
  const containerRef = useRef<T | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      setIsMounted(true);
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      setIsMounted(true);
      return;
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setIsMounted(true);
          observer.disconnect();
          return;
        }
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, isMounted };
}

