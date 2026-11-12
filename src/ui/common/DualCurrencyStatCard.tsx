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
        'group relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-xs transition-all duration-200',
        isInteractive &&
          'cursor-pointer hover:border-[var(--app-border-hover,#94a3b8)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30',
        isActive && 'border-blue-500 bg-blue-50/40 dark:border-blue-400 dark:bg-blue-950/20 ring-1 ring-blue-500',
        className
      )}
    >
      {/* Top Header: Title, Count, Icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
            {title}
          </span>
          {countText && (
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
              {countText}
            </span>
          )}
        </div>
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-xs transition-transform group-hover:scale-105',
            iconBgClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Main Monetary Values */}
      <div className="mt-2 flex flex-col">
        {isDual ? (
          <div className="flex flex-col gap-1">
            {/* SAR Row */}
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                ر.س
              </span>
              <span
                className={cn(
                  'text-xs font-bold font-mono tracking-tight',
                  colorClass
                )}
              >
                {formatCurrency(amountSAR, 'SAR')}
              </span>
            </div>
            {/* YER Row */}
            <div className="flex items-baseline justify-between gap-1 border-t border-slate-100 dark:border-slate-800/80 pt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                ر.ي
              </span>
              <span className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300">
                {formatCurrency(amountYER, 'YER')}
              </span>
            </div>
          </div>
        ) : currencyMode === 'SAR' ? (
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                'text-sm font-bold font-mono tracking-tight',
                colorClass
              )}
            >
              {formatCurrency(amountSAR, 'SAR')}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                'text-sm font-bold font-mono tracking-tight',
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
        <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 dark:border-slate-800/60 pt-1 text-[10px]">
          {subtext && (
            <span className="text-slate-400 dark:text-slate-500 truncate">
              {subtext}
            </span>
          )}
          {trend && (
            <div
              className={cn(
                'flex items-center gap-0.5 font-bold font-mono shrink-0',
                trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
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
