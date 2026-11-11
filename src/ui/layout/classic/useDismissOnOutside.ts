import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * يغلق القوائم المنسدلة عند النقر خارجها أو عند الضغط على Escape.
 * SVG/Node فحص صريح لتفادي أخطاء الأنواع عند تمرير الأحداث من document.
 */
export const useDismissOnOutside = (
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDismiss: () => void
): void => {
  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target) !== true) {
        onDismiss();
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, enabled, onDismiss]);
};
