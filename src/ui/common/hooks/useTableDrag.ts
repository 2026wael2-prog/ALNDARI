import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTableDragOptions {
  enableDrag?: boolean | undefined;
  isZoomed?: boolean | undefined;
}

export interface UseTableDragReturn {
  isDragging: boolean;
  position: { x: number; y: number };
  handleTableDragStart: (e: React.MouseEvent) => void;
  resetPosition: () => void;
}

interface Point {
  x: number;
  y: number;
}

/** جلسة سحب واحدة: نقطة الإمساك + الإزاحة المتراكمة قبل بدء الجلسة. */
interface DragSession {
  startClientX: number;
  startClientY: number;
  origin: Point;
}

const IDLE_POSITION: Point = { x: 0, y: 0 };

/** يضبط مؤشر الجسم ومنع تحديد النص أثناء السحب. */
const setBodyDragState = (isActive: boolean): void => {
  document.body.style.cursor = isActive ? 'grabbing' : '';
  document.body.style.userSelect = isActive ? 'none' : '';
};

/**
 * يسجّل مستمعَي السحب على `document` بإشارة إلغاء واحدة.
 * `signal` يضمن إزالة المستمعين عند `mouseup` وعند إلغاء التركيب معاً.
 */
const listenToDragSession = (
  signal: AbortSignal,
  session: DragSession,
  onMove: (next: Point) => void,
  onSessionEnd: () => void
): void => {
  document.addEventListener(
    'mousemove',
    (moveEvent: MouseEvent): void => {
      onMove({
        x: session.origin.x + (moveEvent.clientX - session.startClientX),
        y: session.origin.y + (moveEvent.clientY - session.startClientY),
      });
    },
    { signal }
  );
  document.addEventListener('mouseup', onSessionEnd, { signal });
};

/** يُلغي الجلسة النشطة (إن وُجدت) ويفرّغ المرجع. */
const abortSession = (abortRef: React.RefObject<AbortController | null>): void => {
  abortRef.current?.abort();
  abortRef.current = null;
};

/** يبدأ جلسة سحب جديدة: يُلغي السابقة ويسجّل المستمعين بإشارة جديدة. */
const beginDrag = (options: {
  event: React.MouseEvent;
  origin: Point;
  abortRef: React.RefObject<AbortController | null>;
  onStart: () => void;
  onMove: (next: Point) => void;
  onEnd: () => void;
}): void => {
  abortSession(options.abortRef);
  const controller = new AbortController();
  options.abortRef.current = controller;
  options.onStart();
  listenToDragSession(
    controller.signal,
    {
      startClientX: options.event.clientX,
      startClientY: options.event.clientY,
      origin: options.origin,
    },
    options.onMove,
    options.onEnd
  );
};

/**
 * سحب الجدول العائم بالفأرة.
 *
 * سبب وجود الملف: كان منطق السحب مكتوباً داخل `ExcelTable` على ثلاث حالات
 * (`isDragging`, `dragOffset`, `position`) ويرتكب خطأين:
 *  1. يقرأ `dragOffset` من الحالة **بعد** طلب تحديثها في نفس المعالج، فيقرأ
 *     `{0,0}` عند أول حركة، فتقفز النافذة إلى إحداثيات المؤشر المطلقة.
 *  2. يجمع مستمعَي `document` دون تنظيف عند إلغاء التركيب، فتبقى تُحدّث حالة
 *     مكوّن مُفكَّك (تسريب ذاكرة).
 *
 * الحل هنا: الإزاحة تُحسب نسبياً من نقطة الإمساك (`origin + delta`) بلا أي
 * قراءة لحالة قديمة، والمستمعان يُلغَيان بـ`AbortController` عند `mouseup`
 * وعند `unmount`.
 */
export const useTableDrag = ({
  enableDrag = false,
  isZoomed = false,
}: UseTableDragOptions): UseTableDragReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<Point>(IDLE_POSITION);
  /** مرآة مرجعية للموضع الحالي حتى يُقرأ صحيحاً داخل معالجات DOM. */
  const positionRef = useRef<Point>(IDLE_POSITION);
  const abortRef = useRef<AbortController | null>(null);
  const applyPosition = useCallback((next: Point): void => {
    positionRef.current = next;
    setPosition(next);
  }, []);
  const releaseListeners = useCallback((): void => {
    abortSession(abortRef);
  }, []);
  const handleTableDragStart = useCallback(
    (e: React.MouseEvent): void => {
      if (!enableDrag || isZoomed) return;
      e.preventDefault();
      e.stopPropagation();
      beginDrag({
        event: e,
        origin: positionRef.current,
        abortRef,
        onStart: (): void => {
          setIsDragging(true);
        },
        onMove: applyPosition,
        onEnd: (): void => {
          setIsDragging(false);
          setBodyDragState(false);
          releaseListeners();
        },
      });
      setBodyDragState(true);
    },
    [enableDrag, isZoomed, releaseListeners, applyPosition]
  );
  const resetPosition = useCallback((): void => {
    releaseListeners();
    setIsDragging(false);
    applyPosition(IDLE_POSITION);
  }, [releaseListeners, applyPosition]);
  useEffect(() => releaseListeners, [releaseListeners]);
  return { isDragging, position, handleTableDragStart, resetPosition };
};
