import React from 'react';
import { cn } from '../../../../../core/utils';

export const formatNumber = (value: number) => {
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toFixed(0);
};

interface SalesChartSummaryProps {
    stats: {
        totalSales: number;
        totalProfit: number;
        avgSales: number;
        trend: number;
    };
    maxSales: number;
}

export const SalesChartSummary: React.FC<SalesChartSummaryProps> = ({ stats, maxSales }) => {
    return (
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800 sm:mt-4 sm:gap-3 sm:pt-4 md:mt-6 md:gap-4 md:pt-6">
            <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
                <span className="truncate text-[10px] font-bold text-[var(--app-text-secondary)] sm:text-[10px]">المبيعات</span>
                <div className="flex items-end gap-1 sm:gap-2">
                    <span className="truncate font-mono text-xs font-bold text-[var(--app-text)] sm:text-base md:text-xl">{formatNumber(stats.totalSales)}</span>
                    {stats.trend !== 0 && (
                        <span className={cn("hidden text-[10px] font-bold sm:inline sm:text-[10px]", stats.trend > 0 ? "text-emerald-500" : "text-rose-500")}>
                            {stats.trend > 0 ? '+' : ''}{stats.trend.toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
                <span className="truncate text-[10px] font-bold text-[var(--app-text-secondary)] sm:text-[10px]">الأرباح</span>
                <span className={cn("truncate font-mono text-xs font-bold sm:text-base md:text-xl", stats.totalProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {formatNumber(stats.totalProfit)}
                </span>
            </div>

            <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
                <span className="truncate text-[10px] font-bold text-[var(--app-text-secondary)] sm:text-[10px]">المتوسط</span>
                <span className="truncate font-mono text-xs font-bold text-[var(--app-text)] sm:text-base md:text-xl">
                    {formatNumber(stats.avgSales)}
                </span>
            </div>

            <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
                <span className="truncate text-[10px] font-bold text-[var(--app-text-secondary)] sm:text-[10px]">أفضل أداء</span>
                <span className="truncate font-mono text-xs font-bold text-blue-600 sm:text-base md:text-xl">
                    {formatNumber(maxSales)}
                </span>
            </div>
        </div>
    );
};
