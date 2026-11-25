import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../core/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  colorClass: string;
  iconBgClass: string;
  variant?: 'default' | 'compact';
  trend?:
    | {
        value: number;
        isPositive: boolean;
      }
    | undefined;
  className?: string;
  /**
   * يجعل البطاقة قابلة للنقر (تُستخدم كفلتر: بطاقة «متأخر» تُصفّي الطابور).
   * اختياري تماماً: بدون تمريره تبقى البطاقة عنصر عرض كما كانت.
   */
  onClick?: (() => void) | undefined;
  /** تمييز البطاقة المختارة كفلتر نشط. */
  isActive?: boolean | undefined;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  icon: Icon,
  colorClass,
  iconBgClass,
  variant = 'default',
  trend,
  className,
  onClick,
  isActive = false,
}) => {
  const isCompact = variant === 'compact';
  const isInteractive = typeof onClick === 'function';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      {...(isInteractive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: handleKeyDown,
            'aria-pressed': isActive,
          }
        : {})}
      className={cn(
        'stat-card group flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm transition-all duration-300 hover:border-[var(--accent)]/30 hover:shadow-md sm:rounded-xl',
        isCompact ? 'p-1.5 sm:p-2 lg:p-2.5' : 'p-1.5 sm:p-2.5 md:p-3 lg:p-3.5 xl:p-4',
        isInteractive && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50',
        isActive && 'border-[var(--accent)]/60 ring-2 ring-[var(--accent)]/40',
        className
      )}
    >

      <div className={cn('flex items-start justify-between gap-0.5 sm:gap-1.5', isCompact ? 'mb-0.5' : 'mb-0.5 md:mb-1')}>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate font-bold leading-tight text-[var(--app-text-secondary)] sm:font-medium',
              isCompact
                ? 'mb-0.5 text-[10px]'
                : 'mb-0.5 text-[10px] sm:text-[11px] md:mb-1 md:text-xs'
            )}
            title={title}
          >
            {title}
          </span>
          <h3
            dir="ltr"
            title={String(value)}
            className={cn(
              'break-words text-right font-mono font-black leading-tight tabular-nums tracking-tight sm:font-bold',
              isCompact
                ? 'text-[11px] sm:text-xs lg:text-sm'
                : 'text-[11px] sm:text-sm md:text-base lg:text-lg',
              colorClass
            )}
          >
            {value}
          </h3>
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-110 sm:rounded-lg',
            isCompact ? 'p-0.5 sm:p-1 lg:p-1.5' : 'p-0.5 sm:p-1.5 lg:p-2',
            iconBgClass + ' bg-opacity-10'
          )}
        >
          <Icon
            className={cn(
              colorClass,
              isCompact
                ? 'h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-3.5 lg:w-3.5'
                : 'h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5'
            )}
          />
        </div>
      </div>

      {(subtext || trend) && (
        <div
          className={cn(
            'mt-1 items-center justify-between border-t border-[var(--app-border)] pt-1 md:mt-1.5 md:pt-1.5',
            trend ? 'flex' : 'hidden sm:flex'
          )}
        >
          <span className="hidden max-w-[70%] truncate text-[10px] font-medium text-[var(--app-text-secondary)] sm:inline">
            {subtext}
          </span>
          {trend && (
            <span
              className={cn(
                'rounded-full border px-1 py-0 text-[10px] font-semibold sm:px-2 sm:py-0.5 sm:text-[10px]',
                trend.isPositive
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20'
                  : 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-900/20'
              )}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
