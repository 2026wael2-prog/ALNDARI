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
    <div className="flex h-full min-h-[240px] animate-pulse flex-col items-center justify-center gap-3 p-6 text-center md:min-h-[400px] md:gap-4 md:p-10">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent md:h-16 md:w-16"></div>
      <div className="text-sm font-bold text-gray-400 md:text-lg">{t('loading_financial_data')}</div>
    </div>
  );
};

const DashboardError = ({ refetch, isFetching }: { refetch: () => void; isFetching: boolean }) => (
  <div className="font-cairo flex h-full min-h-[240px] flex-col items-center justify-center gap-4 bg-[var(--app-bg)] p-6 text-center md:min-h-[400px] md:gap-6 md:p-10">
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
          <div className="flex max-w-full items-center gap-1.5 md:gap-2">
            {/* Period Selector Tabs */}
            <div className="no-scrollbar inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-0.5 text-xs">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPeriod(opt.key);
                  }}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold transition-all duration-150 sm:px-2.5 sm:text-[11px]',
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
              className="shrink-0 rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-secondary)] transition-all hover:bg-[var(--app-surface-hover)] hover:text-[var(--accent)] active:scale-90"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      <div className="custom-scrollbar relative z-10 flex-1 overflow-y-auto px-1 py-2 pb-20 md:px-3">
        <ContentContainer>
          {/* 1. شريط المؤشرات الرئيسية (KPIs) */}
          <Suspense
            fallback={
              <div className="h-28 animate-pulse rounded-xl bg-[var(--app-surface)]" />
            }
          >
            <StatsGrid
              stats={stats}
              sparklineData={salesData.map(d => Number(d.value) || 0)}
              periodLabel={periodLabel}
            />
          </Suspense>

          {/* 2. الصحة المالية + الإجراءات السريعة (ارتفاع موحد) */}
          <Suspense
            fallback={
              <div className="mt-2.5 h-32 animate-pulse rounded-xl bg-[var(--app-surface)] md:mt-3.5 md:h-44" />
            }
          >
            <div className="mt-2.5 grid grid-cols-1 items-stretch gap-2.5 md:mt-3.5 md:gap-3.5 xl:grid-cols-12">
              <div className="flex flex-col xl:col-span-5 [&>*]:h-full">
                <FinancialHealthScore stats={stats} cashFlow={cashFlow} targets={targets} />
              </div>
              <div className="flex flex-col xl:col-span-7 [&>*]:h-full">
                <QuickActions />
              </div>
            </div>
          </Suspense>

          {/* 3. الإشعارات الذكية */}
          <GlobalErrorBoundary>
            <Suspense fallback={null}>
              <div className="mt-2.5 md:mt-3.5">
                <AISmartNotifications
                  stats={stats}
                  lowStockProducts={lowStockProducts}
                  alerts={alerts}
                />
              </div>
            </Suspense>
          </GlobalErrorBoundary>

          {/* 4. الشبكة التحليلية الموزونة (12 عموداً — صفوف متساوية الارتفاع بلا تشوش بصري) */}
          <div className="mt-2.5 grid grid-cols-1 items-stretch gap-2.5 md:mt-3.5 md:grid-cols-2 md:gap-3.5 xl:grid-cols-12">
            {/* الصف الأول: تدفق المبيعات (6) + الإيرادات والمصروفات (3) + مؤشر الهدف (3) */}
            <Suspense fallback={<ChartSkeleton />}>
              <div className="flex min-h-[210px] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 transition-colors md:col-span-2 md:min-h-[320px] md:p-4 xl:col-span-6">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[var(--app-text)]">
                        {t('sales_flow_analysis')}{' '}
                        <span className="text-[10px] font-normal text-emerald-500">(قطع الغيار)</span>
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
                <div className="min-h-0 flex-1">
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
                  <div className="h-[210px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[320px] xl:col-span-3" />
                }
              >
                <div className="flex min-h-[210px] flex-col md:col-span-1 md:min-h-[320px] xl:col-span-3 [&>*]:h-full">
                  <RevenueExpensesChart data={revenueExpensesData} />
                </div>
              </Suspense>
            </GlobalErrorBoundary>

            <Suspense
              fallback={
                <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[320px] xl:col-span-3" />
              }
            >
              <div className="flex min-h-[200px] flex-col md:col-span-1 md:min-h-[320px] xl:col-span-3 [&>*]:h-full">
                <PerformanceGauge
                  value={salesValue}
                  target={salesTarget}
                  title={
                    period === 'today'
                      ? 'هدف المبيعات اليومي'
                      : period === 'last_7_days'
                        ? 'هدف مبيعات آخر 7 أيام'
                        : period === 'this_year'
                          ? 'هدف المبيعات السنوي'
                          : period === 'all_time'
                            ? 'هدف المبيعات الإجمالي'
                            : 'هدف المبيعات الشهري'
                  }
                  formatValue={v => formatCurrency(v)}
                />
              </div>
            </Suspense>

            {/* الصف الثاني: التدفق النقدي (4) + نظرة المخزون (4) + أحدث الأنشطة (4) */}
            <Suspense
              fallback={
                <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[300px] xl:col-span-4" />
              }
            >
              <div className="flex min-h-[200px] flex-col md:col-span-1 md:min-h-[300px] xl:col-span-4 [&>*]:h-full">
                <CashFlowWidget data={cashFlow} />
              </div>
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[300px] xl:col-span-4" />
              }
            >
              <div className="flex min-h-[200px] flex-col md:col-span-1 md:min-h-[300px] xl:col-span-4 [&>*]:h-full">
                <InventoryOverview lowStockProducts={lowStockProducts} />
              </div>
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-2 md:h-[300px] xl:col-span-4" />
              }
            >
              <div className="flex min-h-[200px] flex-col md:col-span-2 md:min-h-[300px] xl:col-span-4 [&>*]:h-full">
                <RecentActivity activities={recentActivities} />
              </div>
            </Suspense>

            {/* الصف الثالث: التصنيفات (4) + عروض الأسعار (4) + شرائح العملاء (4) */}
            <Suspense
              fallback={
                <div className="h-[210px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[340px] xl:col-span-4" />
              }
            >
              <div className="flex min-h-[210px] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 md:col-span-1 md:min-h-[340px] md:p-4 xl:col-span-4">
                <h3 className="mb-2 shrink-0 text-xs font-bold text-[var(--app-text)] md:mb-3">
                  التصنيفات الأكثر حركة
                </h3>
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-1">
                  <CategoriesChart
                    data={categoryData.map(d => ({ name: d.name, value: d.value ?? 0 }))}
                  />
                </div>
              </div>
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[210px] animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-1 md:h-[340px] xl:col-span-4" />
              }
            >
              <div className="flex min-h-[210px] flex-col md:col-span-1 md:min-h-[340px] xl:col-span-4 [&>*]:h-full">
                <QuotationSummaryWidget />
              </div>
            </Suspense>

            <Suspense fallback={null}>
              <div className="flex min-h-[210px] flex-col md:col-span-2 md:min-h-[340px] xl:col-span-4 [&>*]:h-full">
                <CustomerSegmentation companyId={companyId} />
              </div>
            </Suspense>

            {/* الصف الرابع: الأعلى أداءً بعرض كامل */}
            <Suspense
              fallback={
                <div className="col-span-1 h-48 animate-pulse rounded-xl bg-[var(--app-surface)] md:col-span-2 md:h-72 xl:col-span-12" />
              }
            >
              <TopPerformers
                products={topProducts as unknown as TopProduct[]}
                customers={topCustomers as unknown as TopCustomer[]}
                periodLabel={periodLabel}
                className="col-span-1 md:col-span-2 xl:col-span-12"
              />
            </Suspense>

            {/* الصف الخامس: اقتراحات النقل (6) + التنبيهات (3) + تنبيه المشتريات الذكي (3) */}
            <Suspense fallback={null}>
              <div className="flex min-h-[175px] flex-col md:col-span-2 md:min-h-[260px] xl:col-span-6 [&>*]:h-full">
                <WarehouseTransferSuggestions />
              </div>
            </Suspense>

            <Suspense fallback={null}>
              <div className="flex min-h-[175px] flex-col md:col-span-1 md:min-h-[260px] xl:col-span-3 [&>*]:h-full">
                <AlertsPanel
                  alerts={alerts.map(a => ({
                    id: a.id,
                    type: a.type === 'critical' ? 'urgent' : a.type,
                    message: a.message,
                    time: a.time ?? '',
                  }))}
                />
              </div>
            </Suspense>

            <Suspense fallback={null}>
              <div className="flex min-h-[175px] flex-col md:col-span-1 md:min-h-[260px] xl:col-span-3 [&>*]:h-full">
                <SmartPurchaseAlert lowStockItems={lowStockProducts} />
              </div>
            </Suspense>

            {/* الصف السادس: الأهداف الذكية بعرض كامل */}
            <Suspense fallback={null}>
              <div className="md:col-span-2 xl:col-span-12">
                <SmartTargets targets={targets} />
              </div>
            </Suspense>
          </div>
        </ContentContainer>
      </div>
    </div>
  );
};

export default DashboardPage;
