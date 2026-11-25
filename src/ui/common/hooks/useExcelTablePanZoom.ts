import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface UseExcelTablePanZoomParams {
  initialZoom: number;
  tableRef: React.RefObject<HTMLDivElement | null>;
  endSelection: () => void;
}

export function useExcelTablePanZoom({
  initialZoom,
  tableRef,
  endSelection,
}: UseExcelTablePanZoomParams) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(initialZoom || 1);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const panStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    if (initialZoom && initialZoom !== zoomLevel) {
      setZoomLevel(initialZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialZoom]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoomLevel(z => Math.min(2.0, Math.max(0.6, Math.round((z + delta) * 10) / 10)));
    }
  };

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = tableRef.current;
    if (!container) return;
    const shouldPan = isPanMode || e.button === 1 || (e.altKey && e.button === 0);
    if (!shouldPan) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
      return;
    }
    e.preventDefault();
    setIsPanning(true);
    panStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  };

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panStateRef.current || !tableRef.current) return;
    const dx = e.clientX - panStateRef.current.startX;
    const dy = e.clientY - panStateRef.current.startY;
    tableRef.current.scrollLeft = panStateRef.current.scrollLeft - dx;
    tableRef.current.scrollTop = panStateRef.current.scrollTop - dy;
  };

  const stopPanAndSelection = () => {
    if (panStateRef.current) {
      panStateRef.current = null;
      setIsPanning(false);
    }
    endSelection();
  };

  return {
    isZoomed,
    setIsZoomed,
    zoomLevel,
    setZoomLevel,
    isPanMode,
    setIsPanMode,
    isPanning,
    handleWheel,
    handleContainerMouseDown,
    handleContainerMouseMove,
    stopPanAndSelection,
  };
}
