import { useCallback, useEffect, useRef, useState } from 'react';

/** اتجاهات مقابض تغيير حجم الجدول (الأضلاع الأربعة + الزوايا الأربع). */
export type TableResizeDirection = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export interface TableSize {
  width?: string | undefined;
  height?: string | undefined;
}

export interface UseTableWrapperResizeOptions {
  tableWrapperRef: React.RefObject<HTMLDivElement | null>;
  minWidth?: number | undefined;
  minHeight?: number | undefined;
}

export interface UseTableWrapperResizeReturn {
  customSize: TableSize;
  handleWrapperResizeStart: (direction: TableResizeDirection, e: React.MouseEvent) => void;
  resetSize: () => void;
}

const DEFAULT_MIN_WIDTH = 400;
const DEFAULT_MIN_HEIGHT = 200;

interface ResizeSession {
  direction: TableResizeDirection;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  minWidth: number;
  minHeight: number;
}

/** يحسب المقاس الجديد بعد سحب أحد المقابض (يحافظ على الحد الأدنى). */
const computeSize = (
  session: ResizeSession,
  clientX: number,
  clientY: number
): TableSize => {
  const deltaX = clientX - session.startX;
  const deltaY = clientY - session.startY;
  const { direction, startWidth, startHeight } = session;

  let width = startWidth;
  let height = startHeight;

  if (direction.includes('e')) width = startWidth + deltaX;
  if (direction.includes('w')) width = startWidth - deltaX;
  if (direction.includes('s')) height = startHeight + deltaY;
  if (direction.includes('n')) height = startHeight - deltaY;

  return {
    width: `${String(Math.max(session.minWidth, width))}px`,
    height: `${String(Math.max(session.minHeight, height))}px`,
  };
};

/** يبني جلسة تغيير الحجم من حدث البدء والمقاس الحالي. */
const createResizeSession = (options: {
  direction: TableResizeDirection;
  event: React.MouseEvent;
  wrapper: HTMLDivElement | null;
  minWidth: number;
  minHeight: number;
}): ResizeSession => ({
  direction: options.direction,
  startX: options.event.clientX,
  startY: options.event.clientY,
  startWidth: options.wrapper?.offsetWidth ?? 0,
  startHeight: options.wrapper?.offsetHeight ?? 0,
  minWidth: options.minWidth,
  minHeight: options.minHeight,
});

/** يسجّل مستمعَي التغيير على `document` بإشارة إلغاء واحدة. */
const listenToResizeSession = (
  signal: AbortSignal,
  session: ResizeSession,
  onResize: (size: TableSize) => void,
  onSessionEnd: () => void
): void => {
  document.addEventListener(
    'mousemove',
    (moveEvent: MouseEvent): void => {
      onResize(computeSize(session, moveEvent.clientX, moveEvent.clientY));
    },
    { signal }
  );
  document.addEventListener('mouseup', onSessionEnd, { signal });
};

/**
 * تغيير حجم حاوية الجدول بسحب المقابض الثمانية.
 *
 * سبب وجود الملف: كان المنطق مكتوباً داخل `ExcelTable` (~50 سطراً) ويضيف
 * مستمعَي `mousemove`/`mouseup` على `document` دون أي تنظيف عند إلغاء التركيب،
 * فتبقى تُحدّث حالة جدول أُغلق وتُسرّب الذاكرة. هنا يُلغى المستمعان عبر
 * `AbortController` في `mouseup` **و** عند `unmount`.
 */
export const useTableWrapperResize = ({
  tableWrapperRef,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
}: UseTableWrapperResizeOptions): UseTableWrapperResizeReturn => {
  const [customSize, setCustomSize] = useState<TableSize>({});
  const abortRef = useRef<AbortController | null>(null);

  const releaseListeners = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const endSession = useCallback((): void => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    releaseListeners();
  }, [releaseListeners]);

  const handleWrapperResizeStart = useCallback(
    (direction: TableResizeDirection, e: React.MouseEvent): void => {
      e.stopPropagation();
      const session = createResizeSession({
        direction,
        event: e,
        wrapper: tableWrapperRef.current,
        minWidth,
        minHeight,
      });
      releaseListeners();
      const controller = new AbortController();
      abortRef.current = controller;
      listenToResizeSession(controller.signal, session, setCustomSize, endSession);
      document.body.style.cursor = `${direction}-resize`;
      document.body.style.userSelect = 'none';
    },
    [tableWrapperRef, minWidth, minHeight, releaseListeners, endSession]
  );

  const resetSize = useCallback((): void => {
    releaseListeners();
    setCustomSize({});
  }, [releaseListeners]);

  // لا تترك مؤشر الجسم مقفلاً ولا مستمعات معلّقة إن أُغلق الجدول أثناء السحب.
  useEffect(() => endSession, [endSession]);

  return { customSize, handleWrapperResizeStart, resetSize };
};
