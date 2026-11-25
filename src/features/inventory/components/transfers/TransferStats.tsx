import React from 'react';
import { ArrowLeftRight, TrendingUp, Package, Warehouse as WarehouseIcon } from 'lucide-react';
import { cn } from '../../../../core/utils';

interface TransferStatsProps {
    stats: {
        total: number;
        thisMonth: number;
        totalItems: number;
        warehouseCount: number;
    };
}

const TransferStats: React.FC<TransferStatsProps> = ({ stats }) => {
    const statConfigs = [
        { label: 'إجمالي المناقلات', value: stats.total, icon: ArrowLeftRight, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
        { label: 'هذا الشهر', value: stats.thisMonth, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
        { label: 'أصناف منقولة', value: stats.totalItems, icon: Package, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' },
        { label: 'المستودعات', value: stats.warehouseCount, icon: WarehouseIcon, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    ];

    return (
        <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {statConfigs.map((s, i) => (
                <div key={i} className="flex min-w-0 items-center gap-1 rounded-lg border border-gray-50 bg-[var(--app-surface)] p-1.5 shadow-sm dark:border-slate-800 sm:gap-2 sm:p-2">
                    <div className={cn("hidden shrink-0 rounded-md p-1.5 sm:block", s.color)}>
                        <s.icon size={14} />
                    </div>
                    <div className="min-w-0">
                        <span className="block truncate text-[10px] font-black uppercase tracking-tighter text-gray-400 sm:text-[10px]">{s.label}</span>
                        <span className="font-mono text-xs font-black leading-none text-gray-800 dark:text-gray-100 sm:text-sm">{s.value}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default TransferStats;
