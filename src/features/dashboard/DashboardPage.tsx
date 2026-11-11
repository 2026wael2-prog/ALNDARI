import React, { Suspense, lazy, useState } from 'react';
import ContentContainer from '../../ui/layout/ContentContainer';
import { useDashboardMetrics } from './hooks/useDashboardMetrics';
import { useTranslation } from '../../lib/hooks/useTranslation';
import { useAuthStore } from '../auth/store';
import type { DashboardPeriod } from './types';

import MicroHeader from '../../ui/base/MicroHeader';
import ChartSkeleton from '../../ui/base/ChartSkeleton';
import { RefreshCw, Activity, TrendingUp } from 'lucide-react';
import { GlobalErrorBoundary } from '../../ui/common/GlobalErrorBoundary';
import { formatCurrency, cn } from '../../core/utils';

// Lazy Loaded Widgets
const StatsGrid = lazy(() => import('../../ui/dashboard/StatsGrid'));
const CashFlowWidget = lazy(() => import('./components/CashFlowWidget'));
const TopPerformers = lazy(() => import('./components/TopPerformers'));
import type { TopProduct, TopCustomer } from './components/TopPerformers';
const AlertsPanel = lazy(() => import('./components/AlertsPanel'));
const SalesFlowChart = lazy(() => import('./components/SalesFlowChart'));
const RevenueExpensesChart = lazy(() => import('./components/RevenueExpensesChart'));
const SmartTargets = lazy(() => import('./components/SmartTargets'));
const PerformanceGauge = lazy(() => import('./components/PerformanceGauge'));
const SmartPurchaseAlert = lazy(() => import('./components/SmartPurchaseAlert'));
const CustomerSegmentation = lazy(() => import('../parties/components/CustomerSegmentation'));
const AISmartNotifications = lazy(() => import('./components/AISmartNotifications'));
const FinancialHealthScore = lazy(() => import('./components/FinancialHealthScore'));
const WarehouseTransferSuggestions = lazy(
  () => import('./components/WarehouseTransferSuggestions')
);
const InventoryOverview = lazy(() => import('./components/InventoryOverview'));
const QuickActions = lazy(() => import('./components/QuickActions'));
const CategoriesChart = lazy(() => import('../../ui/dashboard/CategoriesChart'));
const QuotationSummaryWidget = lazy(() => import('./components/QuotationSummaryWidget'));
const RecentActivity = lazy(() => import('./components/RecentActivity'));

const PERIOD_OPTIONS: Array<{ key: DashboardPeriod; label: string }> = [
  { key: 'today', label: 'اليوم' },
  { key: 'last_7_days', label: 'آخر 7 أيام' },
  { key: 'this_month', label: 'هذا الشهر' },
  { key: 'this_year', label: 'هذا العام' },
  { key: 'all_time', label: 'جميع الأوقات' },
];

// Sub-components for state management
const DashboardLoading = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[400px] animate-pulse flex-col items-center justify-center gap-4 p-10 text-center max-md:gap-3 max-md:p-5">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent"></div>
      <div className="text-lg font-bold text-gray-400">{t('loading_financial_data')}</div>
    </div>
  );
};

const DashboardError = ({ refetch, isFetching }: { refetch: () => void; isFetching: boolean }) => (
  <div className="font-cairo flex h-full min-h-[400px] flex-col items-center justify-center gap-6 bg-[var(--app-bg)] p-10 text-center max-md:gap-3 max-md:p-5">
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 max-md:rounded-xl max-md:p-3">
      <Activity size={32} className="animate-pulse text-rose-500 max-md:hidden" />
      <Activity size={24} className="hidden animate-pulse text-rose-500 max-md:block" />
    </div>
    <div>
      <h2 className="mb-2 text-xl font-bold text-[var(--app-text)]">
        عذراً، حدث خطأ أثناء تجميع البيانات
      </h2>
      <p className="mx-auto max-w-md text-sm text-[var(--app-text-secondary)]">
        قد يكون هناك ضغط على الخادم أو مشكلة في الاتصال. يرجى المحاولة مرة أخرى.
      </p>
    </div>
    <button
      onClick={() => {
        refetch();
      }}
      className="shadow-[var(--accent)]/20 flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-95 max-md:px-3"
    >
      <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
      إعادة المحاولة
    </button>
  </div>
);

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';
  // الافتراضي «اليوم»: المنشأة تعمل كل يوم بلا إجازات، ولوحة التحكم تُفتح
  // عادةً لمراجعة يوم العمل الجاري لا الشهر بأكمله.
  const [period, setPeriod] = useState<DashboardPeriod>('today');

  const {
    stats,
    salesData,
    categoryData,
    topProducts,
    topCustomers,
    targets,
    cashFlow,
    alerts,
    lowStockProducts,
    isLoading,
    isError,
    refetch,
    isFetching,
    revenueExpensesData,
    growthRate,
    salesValue,
    salesTarget,
    recentActivities,
    periodLabel,
  } = useDashboardMetrics(period);

  if (isLoading) return <DashboardLoading />;
  if (isError) return <DashboardError refetch={refetch} isFetching={isFetching} />;

  return (
    <div className="font-cairo relative flex h-full flex-col bg-[var(--app-bg)]">
      <MicroHeader
        title={t('smart_performance_summary')}
        icon={Activity}
        iconColor="text-emerald-500"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Selector Tabs */}
            <div className="inline-flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-0.5 text-xs">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPeriod(opt.key);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-bold transition-all duration-150',
                    period === opt.key
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'hover:bg-[var(--app-surface)]/50 text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                refetch();
              }}
              title="تحديث البيانات"
              className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-secondary)] transition-all hover:bg-[var(--app-surface-hover)] hover:text-[var(--accent)] active:scale-90"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      <div className="custom-scrollbar relative z-10 flex-1 overflow-y-auto px-1 py-1.5 pb-20 md:px-2">
        <ContentContainer>
          <Suspense
            fallback={
              <div className="h-40 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FinancialHealthScore stats={stats} cashFlow={cashFlow} targets={targets} />
              <QuickActions />
            </div>
          </Suspense>

          <Suspense
            fallback={
              <div className="mt-3 h-32 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
            }
          >
            <div className="mt-3">
              <StatsGrid
                stats={stats}
                sparklineData={salesData.map(d => Number(d.value) || 0)}
                periodLabel={periodLabel}
              />
            </div>
          </Suspense>

          <Suspense fallback={null}>
            <div className="mt-3">
              <AISmartNotifications
                stats={stats}
                lowStockProducts={lowStockProducts}
                alerts={alerts}
              />
            </div>
          </Suspense>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <Suspense fallback={<ChartSkeleton />}>
              <div className="bg-[var(--app-surface)] rounded-xl border border-[var(--app-border)] p-4 transition-colors">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[var(--app-text)]">
                        {t('sales_flow_analysis')}{' '}
                        <span className="text-[10px] text-emerald-500 font-normal">(قطع الغيار)</span>
                      </h3>
                      <p className="text-[10px] text-[var(--app-text-secondary)]">
                        تدفق المبيعات اليومية
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-2 py-0.5 text-left">
                    <span
                      className={`font-mono text-xs font-bold ${growthRate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                    >
                      {growthRate > 0 ? '+' : ''}
                      {growthRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div>
                  <SalesFlowChart
                    data={salesData.map(d => {
                      const sales = d.value ?? d.sales ?? 0;
                      const purchases = d.purchases ?? 0;
                      const expenses = d.expenses ?? 0;
                      return {
                        name: d.name,
                        value: sales,
                        sales,
                        purchases,
                        expenses,
                        profit: d.profit ?? sales - purchases - expenses,
                      };
                    })}
                    showPeriodSelector={true}
                  />
                </div>
              </div>
            </Suspense>

            <GlobalErrorBoundary sectionName="الإيرادات والمصروفات">
              <Suspense
                fallback={
                  <div className="h-[220px] min-h-[220px] animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
                }
              >
                <RevenueExpensesChart data={revenueExpensesData} />
              </Suspense>
            </GlobalErrorBoundary>

            <Suspense
              fallback={
                <div className="h-40 min-h-[160px] animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
              }
            >
              <PerformanceGauge
                value={salesValue}
                target={salesTarget}
                title="هدف المبيعات الشهري"
                formatValue={v => formatCurrency(v)}
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
              }
            >
              <CashFlowWidget data={cashFlow} />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
              }
            >
              <InventoryOverview
                lowStockProducts={lowStockProducts}
                className="col-span-1 md:col-span-2"
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
              }
            >
              <RecentActivity activities={recentActivities} />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl" />
              }
            >
              <QuotationSummaryWidget />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[300px] min-h-[300px] animate-pulse rounded-xl bg-[var(--app-surface)]" />
              }
            >
              <div className="bg-[var(--app-surface)] h-[350px] rounded-xl border border-[var(--app-border)] p-4">
                <h3 className="mb-4 text-xs font-bold text-[var(--app-text)] max-md:mb-3">
                  التصنيفات الأكثر حركة
                </h3>
                <div className="flex h-full flex-col items-center p-2">
                  <CategoriesChart
                    data={categoryData.map(d => ({ name: d.name, value: d.value ?? 0 }))}
                  />
                </div>
              </div>
            </Suspense>

            <Suspense
              fallback={
                <div className="col-span-1 h-72 animate-pulse rounded-2xl bg-[var(--app-surface)] max-md:rounded-xl md:col-span-2 xl:col-span-3 2xl:col-span-5" />
              }
            >
              <TopPerformers
                products={topProducts as unknown as TopProduct[]}
                customers={topCustomers as unknown as TopCustomer[]}
                periodLabel={periodLabel}
                className="col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-5"
              />
            </Suspense>

            <Suspense fallback={null}>
              <WarehouseTransferSuggestions className="col-span-1 md:col-span-2 xl:col-span-3" />
            </Suspense>

            <Suspense fallback={null}>
              <CustomerSegmentation companyId={companyId} />
            </Suspense>

            <Suspense fallback={null}>
              <AlertsPanel
                alerts={alerts.map(a => ({
                  id: a.id,
                  type: a.type === 'critical' ? 'urgent' : a.type,
                  message: a.message,
                  time: a.time ?? '',
                }))}
              />
            </Suspense>

            <Suspense fallback={null}>
              <SmartPurchaseAlert lowStockItems={lowStockProducts} />
            </Suspense>

            <Suspense fallback={null}>
              <SmartTargets targets={targets} />
            </Suspense>
          </div>
        </ContentContainer>
      </div>
    </div>
  );
};

export default DashboardPage;
