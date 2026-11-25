import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn, formatCurrency } from '../../core/utils';

export interface DualCurrencyStatCardProps {
  title: string;
  amountSAR?: number;
  amountYER?: number;
  currencyMode?: 'ALL' | 'SAR' | 'YER';
  subtext?: string;
  countText?: string;
  icon: LucideIcon;
  colorClass: string;
  iconBgClass: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const DualCurrencyStatCard: React.FC<DualCurrencyStatCardProps> = ({
  title,
  amountSAR = 0,
  amountYER = 0,
  currencyMode = 'ALL',
  subtext,
  countText,
  icon: Icon,
  colorClass,
  iconBgClass,
  trend,
  className,
  onClick,
  isActive = false,
}) => {
  const isInteractive = typeof onClick === 'function';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const isDual = currencyMode === 'ALL';

  return (
    <div
      {...(isInteractive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: handleKeyDown,
          }
        : {})}
      className={cn(
        'group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-xs transition-all duration-200 sm:p-2 md:p-2.5',
        isInteractive &&
          'cursor-pointer hover:border-[var(--app-border-hover,#94a3b8)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30',
        isActive && 'border-blue-500 bg-blue-50/40 dark:border-blue-400 dark:bg-blue-950/20 ring-1 ring-blue-500',
        className
      )}
    >
      {/* Top Header: Title, Count, Icon */}
      <div className="flex items-start justify-between gap-0.5 sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-[10px] font-bold leading-tight text-slate-500 dark:text-slate-400 sm:text-[11px]"
            title={title}
          >
            {title}
          </span>
          {countText && (
            <span className="mt-0.5 hidden truncate text-[10px] font-medium text-slate-400 dark:text-slate-500 sm:inline">
              {countText}
            </span>
          )}
        </div>
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-white shadow-xs transition-transform group-hover:scale-105 sm:h-6 sm:w-6 sm:rounded-md',
            iconBgClass
          )}
        >
          <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </div>
      </div>

      {/* Main Monetary Values */}
      <div className="mt-1 flex flex-col sm:mt-1.5">
        {isDual ? (
          <div className="flex flex-col gap-0.5">
            {/* SAR Row */}
            <div className="flex items-baseline justify-between gap-0.5 sm:gap-1">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500 sm:text-[10px] sm:tracking-wider">
                ر.س
              </span>
              <span
                dir="ltr"
                className={cn(
                  'min-w-0 truncate font-mono text-[10px] font-black tabular-nums tracking-tight sm:text-xs sm:font-bold',
                  colorClass
                )}
              >
                {formatCurrency(amountSAR, 'SAR')}
              </span>
            </div>
            {/* YER Row */}
            <div className="flex items-baseline justify-between gap-0.5 border-t border-slate-100 pt-0.5 dark:border-slate-800/80 sm:gap-1">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500 sm:text-[10px] sm:tracking-wider">
                ر.ي
              </span>
              <span
                dir="ltr"
                className="min-w-0 truncate font-mono text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300 sm:text-[11px]"
              >
                {formatCurrency(amountYER, 'YER')}
              </span>
            </div>
          </div>
        ) : currencyMode === 'SAR' ? (
          <div className="flex items-baseline gap-1">
            <span
              dir="ltr"
              className={cn(
                'truncate font-mono text-[11px] font-black tabular-nums tracking-tight sm:text-sm sm:font-bold',
                colorClass
              )}
            >
              {formatCurrency(amountSAR, 'SAR')}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span
              dir="ltr"
              className={cn(
                'truncate font-mono text-[11px] font-black tabular-nums tracking-tight sm:text-sm sm:font-bold',
                colorClass
              )}
            >
              {formatCurrency(amountYER, 'YER')}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Trend or Subtext */}
      {(subtext || trend) && (
        <div
          className={cn(
            'mt-1 items-center justify-between gap-1 border-t border-slate-100 pt-1 text-[10px] dark:border-slate-800/60 sm:mt-1.5 md:mt-2',
            !trend ? 'hidden sm:flex' : 'flex'
          )}
        >
          {subtext && (
            <span className="hidden truncate text-slate-400 dark:text-slate-500 sm:inline">
              {subtext}
            </span>
          )}
          {trend && (
            <div
              className={cn(
                'flex shrink-0 items-center gap-0.5 font-mono text-[10px] font-bold sm:text-[10px]',
                trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              ) : (
                <ArrowDownRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              )}
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DualCurrencyStatCard;

