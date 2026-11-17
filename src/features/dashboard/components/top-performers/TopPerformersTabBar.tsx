import React from 'react';
import { Box, Columns, Maximize2, Users, type LucideIcon } from 'lucide-react';
import { cn } from '../../../../core/utils';
import type { MainTab } from './types';

interface TopPerformersTabBarProps {
  activeMainTab: MainTab;
  onMainTabChange: (tab: MainTab) => void;
  productsCount: number;
  customersCount: number;
  onOpenFullModal: () => void;
}

/** Primary view-mode switcher and comprehensive analysis modal trigger for TopPerformers. */
export const TopPerformersTabBar: React.FC<TopPerformersTabBarProps> = ({
  activeMainTab,
  onMainTabChange,
  productsCount,
  customersCount,
  onOpenFullModal,
}) => {
  const tabs: { id: MainTab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'both', label: 'عرض مزدوج', icon: Columns },
    { id: 'parts', label: 'قطع الغيار الأكثر طلباً', icon: Box, count: productsCount },
    { id: 'customers', label: 'كبار العملاء', icon: Users, count: customersCount },
  ];

  return (
    <div className="bg-[var(--app-surface)] relative z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeMainTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onMainTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                isActive
                  ? 'border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
              )}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="rounded-full bg-[var(--app-surface-hover)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--app-text)]">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {productsCount > 0 && (
        <button
          onClick={onOpenFullModal}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title="عرض الكشف الشامل والتفاصيل"
        >
          <Maximize2 size={14} />
          <span>الكشف الشامل لقطع الغيار</span>
        </button>
      )}
    </div>
  );
};
