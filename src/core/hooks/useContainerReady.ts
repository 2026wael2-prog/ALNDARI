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

    const updateReady = (width: number, height: number) => {
      const ready = width > 0 && height > 0;
      setIsMounted(prev => (prev === ready ? prev : ready));
    };

    updateReady(el.offsetWidth, el.offsetHeight);

    if (typeof ResizeObserver === 'undefined') {
      setIsMounted(true);
      return;
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        updateReady(width, height);
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, isMounted };
}

