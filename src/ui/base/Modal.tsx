import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon, Expand, Shrink } from 'lucide-react';
import { cn } from '../../core/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full' | 'resizable';
  /** Optional override for the overlay z-index (e.g. when stacking a modal above a fullscreen modal). */
  zIndex?: string;
  /** Hide the draggable header row entirely (caller renders its own header inside the body). */
  hideHeader?: boolean;
  /** Allow closing by clicking outside on the backdrop (default false to prevent accidental data loss). */
  closeOnBackdropClick?: boolean;
}

interface Position {
  x: number;
  y: number;
}
interface Size {
  width: number | string;
  height: number | string;
}

let openModalStackCounter = 0;

/**
 * Allocates the next ascending z-index for custom overlay dialogs (e.g. ProductDetailModal)
 * so they always stack cleanly above fullscreen parent modals.
 */
export const allocateModalZIndex = (): number => {
  openModalStackCounter += 1;
  return 9990 + (openModalStackCounter % 500) * 10;
};

const parseTailwindZIndex = (zIndexClass?: string): number | null => {
  if (!zIndexClass) return null;
  const match = zIndexClass.match(/z-\[(\d+)\]|z-(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1] ?? match[2]);
  return Number.isFinite(parsed) ? parsed : null;
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  icon: Icon,
  title,
  description = '',
  children,
  footer,
  size = 'lg',
  zIndex,
  hideHeader = false,
  closeOnBackdropClick = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(size === 'full');
  const [position, setPosition] = useState<Position | null>(null);
  const [customSize, setCustomSize] = useState<Size | null>(null);
  const [stackOrder, setStackOrder] = useState(() => (isOpen ? ++openModalStackCounter : 0));
  const wasOpenRef = useRef(isOpen);

  const reactId = useId();
  const titleId = `modal-title-${reactId}`;
  const descId = `modal-desc-${reactId}`;
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const resizeRef = useRef<{
    isResizing: boolean;
    direction: string;
    startX: number;
    startY: number;
    initialWidth: number;
    initialHeight: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Reset state & assign ascending stack z-index when modal opens so child modals always appear above fullscreen parent modals
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      openModalStackCounter += 1;
      setStackOrder(openModalStackCounter);
    }
    if (isOpen) {
      setPosition(null);
      setCustomSize(null);
      setIsMaximized(size === 'full');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, size]);

  // Close topmost modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stackOrder === openModalStackCounter) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, stackOrder]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current?.isDragging) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    setPosition({
      x: dragRef.current.initialX + deltaX,
      y: dragRef.current.initialY + deltaY,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  }, [handleDragMove]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current?.isResizing) return;
    const { direction, startX, startY, initialWidth, initialHeight, initialX, initialY } =
      resizeRef.current;

    let newWidth = initialWidth;
    let newHeight = initialHeight;
    let newX = initialX;
    let newY = initialY;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (direction.includes('e')) newWidth = Math.max(320, initialWidth + deltaX);
    if (direction.includes('s')) newHeight = Math.max(200, initialHeight + deltaY);

    if (direction.includes('w')) {
      const addedWidth = -deltaX;
      if (initialWidth + addedWidth >= 320) {
        newWidth = initialWidth + addedWidth;
        newX = initialX + deltaX;
      }
    }

    if (direction.includes('n')) {
      const addedHeight = -deltaY;
      if (initialHeight + addedHeight >= 200) {
        newHeight = initialHeight + addedHeight;
        newY = initialY + deltaY;
      }
    }

    setCustomSize({ width: newWidth, height: newHeight });
    setPosition({ x: newX, y: newY });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    if (isMaximized) return;

    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;

    resizeRef.current = {
      isResizing: true,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: rect.width,
      initialHeight: rect.height,
      initialX: rect.left,
      initialY: rect.top,
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  // Cleanup any active drag/resize listeners if modal closes or unmounts mid-gesture
  useEffect(() => {
    return () => {
      handleDragEnd();
      handleResizeEnd();
    };
  }, [handleDragEnd, handleResizeEnd]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'md:max-w-lg',
    md: 'md:max-w-2xl',
    lg: 'md:max-w-4xl',
    xl: 'md:max-w-5xl',
    '2xl': 'md:max-w-6xl',
    '3xl': 'md:max-w-7xl',
    '4xl': 'md:max-w-[85vw]',
    '5xl': 'md:max-w-[90vw]',
    full: 'md:max-w-[100vw] md:h-full md:rounded-none',
  };

  const toggleFullscreen = () => {
    setIsMaximized(!isMaximized);
    if (!isMaximized) {
      setPosition(null);
      setCustomSize(null);
    }
  };

  const baseStackZIndex = 9990 + (stackOrder % 500) * 10;
  const parsedOverrideZIndex = parseTailwindZIndex(zIndex);
  const computedZIndex =
    parsedOverrideZIndex !== null ? Math.max(baseStackZIndex, parsedOverrideZIndex) : baseStackZIndex;

  const modalStyle: React.CSSProperties = isMaximized
    ? {
        width: '100vw',
        height: '100dvh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: computedZIndex,
      }
    : {
        ...(position
          ? {
              position: 'fixed',
              left: position.x,
              top: position.y,
              margin: 0,
              transform: 'none',
            }
          : {}),
        ...(customSize
          ? {
              width: customSize.width,
              height: customSize.height,
              maxWidth: '98vw',
              maxHeight: '98vh',
            }
          : {}),
      };

  return createPortal(
    <div
      style={{ zIndex: computedZIndex }}
      className={cn(
        'animate-in fade-in fixed inset-0 flex items-end justify-center p-0 duration-100 md:items-center md:p-4',
        zIndex ?? 'z-[9999]',
        !isMaximized && 'bg-slate-950/45'
      )}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={e => {
          e.stopPropagation();
        }}
        style={modalStyle}
        className={cn(
          'animate-in flex w-full max-w-full flex-col overflow-x-hidden border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xl duration-100',
          !position && sizeClasses[isMaximized ? 'full' : size === 'resizable' ? 'lg' : size],
          !isMaximized && 'max-h-[92dvh] rounded-t-2xl md:max-h-[88dvh] md:rounded-2xl',
          isMaximized && 'rounded-none'
        )}
      >
        {/* Multi-directional Resize Handles (Desktop Only) */}
        {!isMaximized && (
          <>
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'n');
              }}
              className="absolute left-0 right-0 top-0 z-50 hidden h-1 cursor-ns-resize hover:bg-blue-500/20 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 's');
              }}
              className="absolute bottom-0 left-0 right-0 z-50 hidden h-1 cursor-ns-resize hover:bg-blue-500/20 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'e');
              }}
              className="absolute bottom-0 right-0 top-0 z-50 hidden w-1 cursor-ew-resize hover:bg-blue-500/20 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'w');
              }}
              className="absolute bottom-0 left-0 top-0 z-50 hidden w-1 cursor-ew-resize hover:bg-blue-500/20 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'nw');
              }}
              className="absolute left-0 top-0 z-[60] hidden h-3 w-3 cursor-nwse-resize hover:bg-blue-500/40 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'ne');
              }}
              className="absolute right-0 top-0 z-[60] hidden h-3 w-3 cursor-nesw-resize hover:bg-blue-500/40 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'sw');
              }}
              className="absolute bottom-0 left-0 z-[60] hidden h-3 w-3 cursor-nesw-resize hover:bg-blue-500/40 md:block"
            />
            <div
              onMouseDown={e => {
                handleResizeStart(e, 'se');
              }}
              className="absolute bottom-0 right-0 z-[60] hidden h-3 w-3 cursor-nwse-resize hover:bg-blue-500/40 md:block"
            />
          </>
        )}

        {/* Mobile Drag Indicator Pill */}
        {!isMaximized && !hideHeader && (
          <div className="flex shrink-0 justify-center bg-[var(--app-surface)] pt-1.5 md:hidden">
            <div className="h-1 w-8 rounded-full bg-[var(--app-border)]" />
          </div>
        )}

        {/* Header - Draggable Area */}
        {!hideHeader && (
          <div
            data-modal-header="true"
            onMouseDown={handleDragStart}
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-2 md:px-5 md:py-4',
              !isMaximized && 'md:cursor-move md:active:cursor-grabbing'
            )}
          >
            <div className="flex min-w-0 select-none items-center gap-2">
              {Icon && (
                <div className="shrink-0 rounded-lg bg-blue-600 p-1.5 text-white shadow-sm md:p-2">
                  <Icon size={14} className="md:hidden" />
                  <Icon size={19} className="hidden md:block" />
                </div>
              )}
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-[13px] font-extrabold leading-tight text-[var(--app-text)] md:text-sm"
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descId}
                    className="mt-0.5 truncate text-[10px] font-semibold text-[var(--app-text-secondary)] md:text-xs"
                  >
                    {description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="hidden rounded-lg p-1.5 text-[var(--app-text-secondary)] transition-all hover:bg-blue-50 hover:text-blue-600 active:scale-90 dark:hover:bg-blue-900/20 md:inline-flex"
                title={isMaximized ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
              >
                {isMaximized ? <Shrink size={18} /> : <Expand size={18} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-[var(--app-text-secondary)] transition-all hover:bg-rose-50 hover:text-red-500 active:scale-90 dark:hover:bg-rose-950/20 md:p-2"
                title="إغلاق النافذة (Esc)"
                aria-label="إغلاق النافذة"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        )}

        {/* Content Segment */}
        <div
          className={cn(
            'custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto bg-[var(--app-bg)]',
            isMaximized || size === 'full' ? 'p-1.5 md:p-2 lg:p-3' : 'p-2.5 sm:p-4 md:p-5'
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-t border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-3 md:p-4 md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
