import React, { useMemo, useState } from 'react';
import { BadgePercent, Box, TrendingUp, Users, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '../../../core/utils';
import FastMovingPartsModal from './FastMovingPartsModal';
import { CustomerItem } from './top-performers/CustomerItem';
import { ProductItem } from './top-performers/ProductItem';
import { TopPerformersTabBar } from './top-performers/TopPerformersTabBar';
import type { MainTab, SortMode, TopCustomer, TopProduct } from './top-performers/types';

export type { TopProduct, TopCustomer } from './top-performers/types';

interface TopPerformersProps {
  products?: TopProduct[];
  customers?: TopCustomer[];
  className?: string;
  periodLabel?: string;
}

const SORT_MODES: { mode: SortMode; label: string; icon: LucideIcon }[] = [
  { mode: 'quantity', label: 'الأسرع حركة (بالكمية)', icon: Zap },
  { mode: 'revenue', label: 'الأكثر إيراداً (بالمبلغ)', icon: TrendingUp },
  { mode: 'profit', label: 'الأعلى ربحاً', icon: BadgePercent },
];

export const TopPerformers: React.FC<TopPerformersProps> = React.memo(
  ({ products = [], customers = [], className, periodLabel = 'الفترة المحددة' }) => {
    const [activeMainTab, setActiveMainTab] = useState<MainTab>('both');
    const [sortMode, setSortMode] = useState<SortMode>('quantity');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const hasProducts = products.length > 0;
    const hasCustomers = customers.length > 0;

    const sortedProducts = useMemo(() => {
      const list = [...products];
      if (sortMode === 'revenue') {
        list.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
      } else if (sortMode === 'profit') {
        list.sort((a, b) => (b.gross_profit || 0) - (a.gross_profit || 0));
      } else {
        list.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      }
      return list;
    }, [products, sortMode]);

    const maxProductVal = useMemo(() => {
      if (!hasProducts) return 0;
      if (sortMode === 'revenue') return Math.max(...products.map(p => p.revenue || 0));
      if (sortMode === 'profit') return Math.max(...products.map(p => p.gross_profit || 0));
      return Math.max(...products.map(p => p.quantity || 0));
    }, [products, hasProducts, sortMode]);

    const maxCustomerTotal = useMemo(
      () => (hasCustomers ? Math.max(...customers.map(c => c.total)) : 0),
      [customers, hasCustomers]
    );

    const partsLimit = activeMainTab === 'parts' ? 8 : 6;
    const customersLimit = activeMainTab === 'customers' ? 8 : 6;

    return (
      <div className={cn('space-y-4', className)}>
        <TopPerformersTabBar
          activeMainTab={activeMainTab}
          onMainTabChange={setActiveMainTab}
          productsCount={products.length}
          customersCount={customers.length}
          onOpenFullModal={() => setIsModalOpen(true)}
        />

        <div
          className={cn(
            'grid gap-4',
            activeMainTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
          )}
        >
          {(activeMainTab === 'both' || activeMainTab === 'parts') && (
            <div className="bg-[var(--app-surface)] relative overflow-hidden rounded-xl border border-[var(--app-border)] p-4 transition-colors">
              <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                    <Box size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold tracking-wide text-[var(--app-text)]">
                      قطع الغيار الأسرع حركة
                    </h3>
                    <p className="text-[10px] text-[var(--app-text-secondary)]">
                      القطع الأكثر طلباً ومبيعاً ({periodLabel})
                    </p>
                  </div>
                </div>

                <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-amber-600 dark:border-white/5 dark:bg-black/20 dark:text-amber-400">
                  عرض أعلى {Math.min(sortedProducts.length, partsLimit)} قطع
                </span>
              </div>

              {/* Sort Tabs Bar */}
              <div className="relative z-10 mb-4 flex items-center gap-1.5 rounded-2xl border border-[var(--app-border)] bg-slate-100 p-1.5 shadow-inner dark:bg-black/25">
                {SORT_MODES.map(({ mode, label, icon: Icon }) => {
                  const isActive = sortMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all sm:text-sm',
                        isActive
                          ? 'bg-amber-500 font-black text-slate-950 shadow-md shadow-amber-500/20'
                          : 'text-[var(--app-text-secondary)] hover:bg-slate-200/70 hover:text-slate-900 dark:hover:bg-white/5 dark:hover:text-white'
                      )}
                    >
                      <Icon size={15} className={isActive ? 'text-slate-950' : 'text-amber-400'} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  'relative z-10 gap-2.5',
                  activeMainTab === 'parts'
                    ? 'grid grid-cols-1 md:grid-cols-2'
                    : 'flex flex-col space-y-2'
                )}
              >
                {hasProducts ? (
                  sortedProducts
                    .slice(0, partsLimit)
                    .map((product, index) => (
                      <ProductItem
                        key={product.id}
                        product={product}
                        index={index}
                        maxVal={maxProductVal}
                        sortMode={sortMode}
                      />
                    ))
                ) : (
                  <div className="col-span-full py-10 text-center">
                    <Box size={36} className="mx-auto mb-3 text-[var(--app-text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--app-text-secondary)]">
                      لا توجد حركات بيع لقطع الغيار في {periodLabel}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(activeMainTab === 'both' || activeMainTab === 'customers') && (
            <div className="bg-[var(--app-surface)] relative overflow-hidden rounded-xl border border-[var(--app-border)] p-4 transition-colors">
              <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold tracking-wide text-[var(--app-text)]">
                      أفضل العملاء والورش
                    </h3>
                    <p className="text-[10px] text-[var(--app-text-secondary)]">
                      العملاء الأكثر شراءً وسحباً ({periodLabel})
                    </p>
                  </div>
                </div>

                <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-2 py-0.5 text-[11px] font-bold text-blue-500">
                  عرض أعلى {Math.min(customers.length, customersLimit)} عملاء
                </span>
              </div>

              <div
                className={cn(
                  'relative z-10 gap-2.5',
                  activeMainTab === 'customers'
                    ? 'grid grid-cols-1 md:grid-cols-2'
                    : 'flex flex-col space-y-2'
                )}
              >
                {hasCustomers ? (
                  customers
                    .slice(0, customersLimit)
                    .map((customer, index) => (
                      <CustomerItem
                        key={customer.id}
                        customer={customer}
                        index={index}
                        maxTotal={maxCustomerTotal}
                      />
                    ))
                ) : (
                  <div className="col-span-full py-10 text-center">
                    <Users size={36} className="mx-auto mb-3 text-[var(--app-text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--app-text-secondary)]">
                      لا توجد بيانات مسحوبات عملاء في {periodLabel}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <FastMovingPartsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          products={products}
          periodLabel={periodLabel}
        />
      </div>
    );
  }
);

export default TopPerformers;
