import React from 'react';
import { FileText, TrendingDown, AlertCircle, CreditCard } from 'lucide-react';
import StatCard from '../../../ui/common/StatCard';
import DualCurrencyStatCard from '../../../ui/common/DualCurrencyStatCard';
import { usePurchaseStats } from '../hooks';
import { formatNumberDisplay } from '../../../core/utils';
import { useAnalyticsFilterStore } from '../../../core/store/analyticsFilterStore';

export const PurchaseStats: React.FC = () => {
  const { currency, period, startDate, endDate } = useAnalyticsFilterStore();
  const { data: stats, isLoading } = usePurchaseStats();

  const periodSubtext =
    period === 'today'
      ? 'اليوم'
      : period === 'week'
        ? 'آخر 7 أيام'
        : period === 'month'
          ? 'الشهر الحالي'
          : period === 'quarter'
            ? 'الربع الحالي'
            : period === 'year'
              ? 'السنة الحالية'
              : `${startDate} ◄ ${endDate}`;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-24 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {/* 1. Invoices Count */}
      <StatCard
        title="فواتير الفترة"
        value={formatNumberDisplay(stats?.invoiceCount ?? 0)}
        subtext={periodSubtext}
        icon={FileText}
        colorClass="text-slate-600 dark:text-slate-300"
        iconBgClass="bg-slate-500"
      />

      {/* 2. Total Purchases (Dual Currency Aware) */}
      <DualCurrencyStatCard
        title="إجمالي المشتريات"
        amountSAR={stats?.totalPurchasesSAR ?? 0}
        amountYER={stats?.totalPurchasesYER ?? 0}
        currencyMode={currency}
        subtext={`حسب ${periodSubtext}`}
        icon={TrendingDown}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />

      {/* 3. Pending/Credit Invoices Count */}
      <StatCard
        title="فواتير غير مسددة"
        value={formatNumberDisplay(stats?.pendingPaymentCount ?? 0)}
        subtext="تحتاج سداد / آجلة"
        icon={AlertCircle}
        colorClass="text-amber-600 dark:text-amber-400"
        iconBgClass="bg-amber-500"
      />

      {/* 4. Total Supplier Debt (Dual Currency Aware) */}
      <DualCurrencyStatCard
        title="إجمالي المديونية"
        amountSAR={stats?.totalDebtSAR ?? 0}
        amountYER={stats?.totalDebtYER ?? 0}
        currencyMode={currency}
        subtext="مستحقات الموردين"
        icon={CreditCard}
        colorClass="text-rose-600 dark:text-rose-400"
        iconBgClass="bg-rose-500"
      />
    </div>
  );
};

export default PurchaseStats;
