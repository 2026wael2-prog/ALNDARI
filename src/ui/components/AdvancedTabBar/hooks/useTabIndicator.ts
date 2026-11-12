// ============================================
// useTabIndicator — منطق حساب موضع مؤشر التاب المتحرك
// ============================================
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type RefObject,
  type MutableRefObject,
} from 'react';

type TabRefs = Record<string, HTMLButtonElement | null>;
interface IndicatorPosition {
  x: number;
  width: number;
  opacity: number;
}

const isRTL = () =>
  document.documentElement.dir === 'rtl' || document.documentElement.getAttribute('dir') === 'rtl';

interface UseTabIndicatorOptions {
  activeTab: string;
  tabRefs: MutableRefObject<TabRefs>;
  containerRef: RefObject<HTMLDivElement | null>;
}

export const useTabIndicator = ({ activeTab, tabRefs, containerRef }: UseTabIndicatorOptions) => {
  const [indicatorPosition, setIndicatorPosition] = useState<IndicatorPosition>({
    x: 0,
    width: 0,
    opacity: 0,
  });
  const animationFrameId = useRef<number | null>(null);
  const isFirstRender = useRef(true);

  const updateIndicatorPosition = useCallback(
    (animate = true) => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);

      animationFrameId.current = requestAnimationFrame(() => {
        const activeTabRef = tabRefs.current[activeTab];
        const container = containerRef.current;
        if (!activeTabRef || !container) {
          setIndicatorPosition(prev => ({ ...prev, opacity: 0 }));
          return;
        }

        const rtl = isRTL();
        const tabWidth = activeTabRef.offsetWidth;
        const containerWidth = container.clientWidth;

        // Position relative to container without expensive window.getComputedStyle (prevents layout thrashing)
        const x = rtl
          ? containerWidth - (activeTabRef.offsetLeft + tabWidth)
          : activeTabRef.offsetLeft;

        setIndicatorPosition({ x, width: tabWidth, opacity: animate ? 1 : 0 });
      });
    },
    [activeTab, tabRefs, containerRef]
  );

  // تحديث الموضع عند تغيير التاب النشط
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      updateIndicatorPosition(false);
    } else {
      updateIndicatorPosition(true);
    }
  }, [activeTab, updateIndicatorPosition]);

  // تحديث الموضع عند تغيير حجم الـ container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = requestAnimationFrame(() => {
        updateIndicatorPosition(false);
      });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, updateIndicatorPosition]);

  // تنظيف عند الـ unmount
  useEffect(() => {
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return { indicatorPosition };
};
