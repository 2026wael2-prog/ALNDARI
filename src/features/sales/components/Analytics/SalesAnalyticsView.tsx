/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/explicit-function-return-type, @typescript-eslint/restrict-template-expressions, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, security/detect-object-injection */
import React from 'react';
import { Sparkles, Cpu } from 'lucide-react';
import { useSalesAnalytics } from '../../hooks/useSalesAnalytics';
import { useAuthStore } from '../../../auth/store';
import { useTranslation } from '../../../../lib/hooks/useTranslation';
import {
  formatCurrency as formatCurrencyUtil,
  formatNumberDisplay,
} from '../../../../core/utils';
import ErrorDisplay from '../../../../ui/base/ErrorDisplay';
import { AnalyticsUnifiedFilterBar } from '../../../../ui/common/AnalyticsUnifiedFilterBar';
import { useAnalyticsFilterStore } from '../../../../core/store/analyticsFilterStore';

// Extracted components
import {
  SalesAIInsights,
  SalesKPIs,
  SalesTrendChart,
  PaymentMethodsChart,
  TopProductsList,
  TopCustomersList,
} from './components';

const SalesAnalyticsView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const {
    period,
    startDate,
    endDate,
    currency,
    paymentType,
    branchId,
  } = useAnalyticsFilterStore();

  const periodLabels: Record<string, string> = {
    today: t('today'),
    yesterday: 'أمس',
    week: t('week'),
    month: t('month'),
    quarter: t('quarter'),
    year: t('year'),
    custom: 'مخصص',
  };

  const {
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    totalSales,
    totalReturns,
    netSales,
    invoiceCount,
    prevTotalSales,
    prevTotalReturns,
    topProducts,
    topCustomers,
    salesByDay,
    salesByPaymentMethod,
  } = useSalesAnalytics({
    companyId: user?.company_id || '',
    startDate,
    endDate,
    period,
    branchId,
    currency,
    paymentType,
  });

  // Currency & Number formatters
  const activeCurrencyCode = currency === 'YER' ? 'YER' : 'SAR';
  const formatCurrency = (value: number) => formatCurrencyUtil(value, activeCurrencyCode);
  const formatNumber = (value: number) => formatNumberDisplay(value);

  // Derive consistent average invoice
  const consistentAvgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;

  const salesGrowth =
    prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : null;
  const returnsGrowth =
    prevTotalReturns > 0
      ? ((totalReturns - prevTotalReturns) / prevTotalReturns) * 100
      : totalReturns > 0
        ? 100
        : null;

  // Calculate cash ratio
  const totalPaymentAmount = salesByPaymentMethod.reduce((sum, p) => sum + p.amount, 0);
  const cashPayment = salesByPaymentMethod.find(p => p.method === 'cash');
  const cashRatio =
    totalPaymentAmount > 0
      ? Math.round(((cashPayment?.amount || 0) / totalPaymentAmount) * 100)
      : 0;

  return (
    <div className="animate-in fade-in space-y-4 pb-24 duration-500">
      {/* High-Tech Executive Header */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Cpu size={20} />
            </div>
            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {t('sales_analytics')}
            </h3>

            {/* Live AI Pulse Telemetry */}
            <span className="flex items-center gap-1.5 rounded-full border border-indigo-200/60 bg-indigo-50/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              <Sparkles size={11} className="text-indigo-500" />
              محرك الذكاء الاصطناعي نشط
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            متابعة فورية للتدفقات البيعية، كفاءة التحصيل، والتنبؤ التقديري بحصيلة الإيرادات
          </p>
        </div>
      </div>

      {/* Unified Multi-Dimensional Filter Bar */}
      <AnalyticsUnifiedFilterBar
        onRefresh={() => {
          void refetch();
        }}
        isRefreshing={isFetching}
      />

      {isError && (
        <ErrorDisplay
          error={error?.message || 'تعذّر تحميل بيانات التحليلات'}
          onRetry={() => {
            void refetch();
          }}
          variant="inline"
        />
      )}

      {/* 1. AI Executive Intelligence Matrix */}
      <SalesAIInsights
        totalSales={totalSales}
        prevTotalSales={prevTotalSales}
        totalReturns={totalReturns}
        netSales={netSales}
        invoiceCount={invoiceCount}
        salesByDay={salesByDay}
        topProducts={topProducts}
        topCustomers={topCustomers}
        cashRatio={cashRatio}
        period={period as any}
        formatCurrency={formatCurrency}
        isLoading={isLoading}
      />

      {/* 2. Cyber HUD KPI Metrics */}
      <SalesKPIs
        totalSales={totalSales}
        netSales={netSales}
        invoiceCount={invoiceCount}
        averageInvoiceValue={consistentAvgInvoice}
        totalReturns={totalReturns}
        topCustomer={topCustomers[0]}
        topProduct={topProducts[0]}
        cashRatio={cashRatio}
        cashAmount={cashPayment?.amount || 0}
        salesGrowth={salesGrowth}
        returnsGrowth={returnsGrowth}
        periodLabel={periodLabels[period] || period}
        isLoading={isLoading}
        formatCurrency={formatCurrency}
        formatNumber={formatNumber}
      />

      {/* 3. Deep Performance Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sales Dynamic Trajectory Wave */}
        <div className="lg:col-span-2">
          <SalesTrendChart
            salesByDay={salesByDay}
            periodLabel={periodLabels[period] || period}
            formatCurrency={formatCurrency}
          />
        </div>

        {/* Payment Methods Liquidity Breakdown */}
        <div className="lg:col-span-1">
          <PaymentMethodsChart
            salesByPaymentMethod={salesByPaymentMethod}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      {/* 4. Leaderboard & Inventory Intelligence */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsList
          topProducts={topProducts}
          totalSales={totalSales}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          isLoading={isLoading}
        />
        <TopCustomersList
          topCustomers={topCustomers}
          formatCurrency={formatCurrency}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default SalesAnalyticsView;
