/* eslint-disable max-lines-per-function, complexity -- خلية عرض توفر المنتج في الفروع مع نافذة منبثقة عائمة (Portal) بدون استهلاك مساحة في العمود */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Building2, MapPin, ArrowUpRight, Warehouse, PackageX } from 'lucide-react';
import type { Product } from '../../types';
import { cn, formatNumberDisplay } from '../../../../core/utils';
import { summarizeProductBranchAvailability } from '../../utils/branchStockSummary';

interface BranchStockAvailabilityCellProps {
  product: Product;
  activeBranchId?: string | null | undefined;
  /** وضع مضغوط جداً لجدول اختيار المنتجات في فاتورة المبيعات */
  compact?: boolean;
  /** أقصى عدد للشارات الظاهرة داخل الخلية قبل التجميع بشارة +N */
  maxVisiblePills?: number;
}

interface PopoverCoords {
  top: number;
  left: number;
  openUpward: boolean;
}

const POPOVER_WIDTH = 276;
const POPOVER_ESTIMATED_HEIGHT = 220;

export const BranchStockAvailabilityCell: React.FC<BranchStockAvailabilityCellProps> = ({
  product,
  activeBranchId,
  compact = false,
  maxVisiblePills = 2,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const summary = useMemo(
    () => summarizeProductBranchAvailability(product, activeBranchId),
    [product, activeBranchId]
  );

  const computeCoords = useCallback((): PopoverCoords | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spaceBelow = viewportH - rect.bottom;
    const openUpward = spaceBelow < POPOVER_ESTIMATED_HEIGHT && rect.top > POPOVER_ESTIMATED_HEIGHT;

    let left = rect.right - POPOVER_WIDTH;
    if (left < 8) left = Math.max(8, rect.left);
    if (left + POPOVER_WIDTH > viewportW - 8) {
      left = Math.max(8, viewportW - POPOVER_WIDTH - 8);
    }

    const top = openUpward ? Math.max(8, rect.top - 6) : Math.min(viewportH - 8, rect.bottom + 6);
    return { top, left, openUpward };
  }, []);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    const next = computeCoords();
    if (next) {
      setCoords(next);
      setIsOpen(true);
    }
  };

  const scheduleClose = () => {
    if (pinned) return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 140);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setPinned(false);
        setIsOpen(false);
      }
    };
    const handleScrollOrResize = () => {
      setPinned(false);
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  useEffect(() => () => clearCloseTimer(), []);

  const { stockedBranches, allBranches, totalQty, availableOnlyInOtherBranches } = summary;
  const visibleBranches = stockedBranches.slice(0, maxVisiblePills);
  const overflowCount = Math.max(0, stockedBranches.length - visibleBranches.length);
  const maxBranchQty = Math.max(1, ...stockedBranches.map(b => b.quantity));

  // في حال عدم وجود توزيع فروع إطلاقاً ولا رصيد
  if (allBranches.length === 0 && totalQty <= 0) {
    const fallbackLoc = product.location && product.location !== '—' ? product.location : null;
    return (
      <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
        {fallbackLoc ? (
          <span className="truncate font-medium" title={fallbackLoc}>
            {fallbackLoc}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900/40">
            <PackageX size={10} />
            <span>غير متوفر</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={triggerRef}
      className="inline-flex max-w-full items-center"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onClick={e => {
        e.stopPropagation();
        if (isOpen && pinned) {
          setPinned(false);
          setIsOpen(false);
        } else {
          setPinned(true);
          openPopover();
        }
      }}
    >
      {/* Compact Single-Line Pills */}
      <button
        type="button"
        className={cn(
          'flex max-w-full items-center gap-1 overflow-hidden rounded-lg transition-all focus:outline-none',
          compact ? 'py-0.5' : 'py-0.5'
        )}
        aria-label="عرض توفر المنتج في الفروع والمستودعات"
      >
        {stockedBranches.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-200/70 bg-rose-50/70 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
            <PackageX size={10} />
            <span>نفذ بالكل</span>
          </span>
        ) : (
          <>
            {availableOnlyInOtherBranches && (
              <span
                className="inline-flex shrink-0 items-center rounded-md border border-amber-300/80 bg-amber-50 px-1 py-0.5 text-[9px] font-black text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300"
                title="غير متوفر في فرعك — متوفر في فرع آخر"
              >
                <ArrowUpRight size={10} />
              </span>
            )}

            {visibleBranches.map(b => (
              <span
                key={b.branchKey}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none transition-colors',
                  b.isCurrentBranch
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-sky-200/80 bg-sky-50/80 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300'
                )}
              >
                {b.isCurrentBranch && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                )}
                <span className="max-w-[54px] truncate">{b.shortLabel}</span>
                <span className="font-mono text-[10px] font-black">
                  {formatNumberDisplay(b.quantity)}
                </span>
              </span>
            ))}

            {overflowCount > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-black leading-none text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                +{overflowCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Floating Portal Breakdown Popover (never clipped by table overflow!) */}
      {isOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            dir="rtl"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={e => {
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              transform: coords.openUpward ? 'translateY(-100%)' : undefined,
              zIndex: 9999,
            }}
            className="animate-in fade-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl duration-100 dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/70">
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] font-black text-slate-800 dark:text-slate-100">
                  التوفر عبر الفروع والمستودعات
                </span>
              </div>
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-black text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                الإجمالي: {formatNumberDisplay(totalQty)}
              </span>
            </div>

            {/* Branch List */}
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto p-1.5 dark:divide-slate-800/70">
              {allBranches.map(branch => {
                const ratio =
                  branch.quantity > 0 ? Math.min(100, Math.round((branch.quantity / maxBranchQty) * 100)) : 0;
                return (
                  <div key={branch.branchKey} className="px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            branch.quantity <= 0
                              ? 'bg-rose-400'
                              : branch.isCurrentBranch
                                ? 'bg-emerald-500'
                                : 'bg-sky-500'
                          )}
                        />
                        <span className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          {branch.branchName}
                        </span>
                        {branch.isCurrentBranch && (
                          <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                            فرعك
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-xs font-black',
                          branch.quantity > 0
                            ? branch.isCurrentBranch
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-sky-600 dark:text-sky-400'
                            : 'text-rose-500'
                        )}
                      >
                        {formatNumberDisplay(branch.quantity)}
                      </span>
                    </div>

                    {/* Micro progress bar */}
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          branch.isCurrentBranch ? 'bg-emerald-500' : 'bg-sky-500'
                        )}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>

                    {/* Warehouses inside this branch */}
                    <div className="mt-1 space-y-0.5 pr-3">
                      {branch.warehouses.map(wh => (
                        <div
                          key={wh.warehouseId}
                          className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400"
                        >
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <Warehouse size={10} className="shrink-0 opacity-70" />
                            <span className="truncate">{wh.warehouseName}</span>
                            {wh.location && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] opacity-75">
                                <MapPin size={8} />
                                {wh.location}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-mono font-bold text-slate-700 dark:text-slate-300">
                            {formatNumberDisplay(wh.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Transfer-ready footer note */}
            {availableOnlyInOtherBranches && (
              <div className="flex items-center gap-1.5 border-t border-amber-100 bg-amber-50/80 px-3 py-1.5 text-[10px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                <ArrowUpRight size={12} className="shrink-0" />
                <span>غير متوفر بفرعك — متاح للطلب أو البيع من فرع شقيق</span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default BranchStockAvailabilityCell;
