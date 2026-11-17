import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn, formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import type { SortMode, TopProduct } from './types';

interface ProductItemProps {
  product: TopProduct;
  index: number;
  maxVal: number;
  sortMode: SortMode;
}

const getRankBadgeClass = (index: number): string => {
  if (index === 0) return 'border-amber-500/40 bg-amber-500/20 text-amber-400';
  if (index === 1) return 'border-slate-400/20 bg-slate-700/50 text-slate-300';
  if (index === 2) return 'border-orange-500/30 bg-orange-900/25 text-orange-400';
  return 'border-white/10 bg-slate-800/40 text-slate-400';
};

export const ProductItem = React.memo(
  ({ product, index, maxVal, sortMode }: ProductItemProps) => {
    const currentVal =
      sortMode === 'revenue'
        ? product.revenue || 0
        : sortMode === 'profit'
          ? product.gross_profit || 0
          : product.quantity || 0;

    const percentage = maxVal > 0 ? (currentVal / maxVal) * 100 : 0;
    const stock = product.current_stock ?? 0;
    const isOut = Boolean(product.is_out_of_stock) || stock <= 0;
    const isLow =
      !isOut && (Boolean(product.is_low_stock) || stock <= (product.min_stock_level ?? 5));

    return (
      <div className="group/item border-[var(--app-border)]/50 bg-[var(--app-surface)]/60 relative flex items-center justify-between overflow-hidden rounded-2xl border p-3.5 transition-all hover:border-amber-500/30 hover:bg-white/5 max-md:p-2.5">
        {/* Progress Bar Background */}
        <div
          className="absolute bottom-0 right-0 top-0 bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-transparent transition-all duration-1000 ease-out"
          style={{ width: `${percentage.toString()}%` }}
        />

        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black shadow-inner backdrop-blur-md sm:h-10 sm:w-10 sm:text-sm',
              getRankBadgeClass(index)
            )}
          >
            {index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[var(--app-text)] transition-colors group-hover/item:text-amber-400 sm:text-sm">
              {product.name}
            </p>

            {/* Spec Badges: Part Number + Brand + Stock Status */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {product.part_number && (
                <span className="rounded-md border border-amber-500/25 bg-slate-800/90 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  OEM: {product.part_number}
                </span>
              )}
              {product.brand && (
                <span className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                  {product.brand}
                </span>
              )}

              {isOut ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                  <XCircle size={11} />
                  <span>نفد من المخزن</span>
                </span>
              ) : isLow ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  <AlertTriangle size={11} />
                  <span>شحيح ({stock})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 size={11} />
                  <span>متوفر ({stock})</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metric Values */}
        <div className="relative z-10 mr-2 flex shrink-0 flex-col items-end text-left">
          {sortMode === 'quantity' ? (
            <>
              <span className="font-mono text-sm font-black text-amber-400 sm:text-base">
                {formatNumberDisplay(product.quantity)}{' '}
                <span className="font-sans text-xs font-bold text-amber-300/80">قطعة</span>
              </span>
              <span className="mt-0.5 font-mono text-xs text-[var(--app-text-secondary)]">
                {formatCurrency(product.revenue)}
              </span>
            </>
          ) : sortMode === 'revenue' ? (
            <>
              <span className="font-mono text-sm font-black text-amber-400 sm:text-base">
                {formatCurrency(product.revenue)}
              </span>
              <span className="mt-0.5 font-mono text-xs text-[var(--app-text-secondary)]">
                {formatNumberDisplay(product.quantity)} مباعة
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-sm font-black text-purple-400 sm:text-base">
                {formatCurrency(product.gross_profit ?? 0)}
                {product.margin_percentage !== undefined && (
                  <span className="mr-1.5 font-sans text-[10px] font-bold text-purple-300">
                    ({product.margin_percentage}%)
                  </span>
                )}
              </span>
              <span className="mt-0.5 font-mono text-xs text-[var(--app-text-secondary)]">
                إيراد: {formatCurrency(product.revenue)} • تكلفة:{' '}
                {formatCurrency(product.cost ?? 0)}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }
);
