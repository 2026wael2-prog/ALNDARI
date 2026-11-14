import React from 'react';
import { TrendingDown, Wallet, RefreshCw, CreditCard } from 'lucide-react';
import StatCard from '../../../ui/common/StatCard';
import DualCurrencyStatCard from '../../../ui/common/DualCurrencyStatCard';
import { usePurchaseStats } from '../hooks';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';
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
              : startDate && endDate
                ? `${startDate} ◄ ${endDate}`
                : 'كل الفترات';

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
      {/* 1. Net Purchases (Dual Currency Aware, after Returns) */}
      <DualCurrencyStatCard
        title="صافي المشتريات"
        amountSAR={stats?.totalPurchasesSAR ?? 0}
        amountYER={stats?.totalPurchasesYER ?? 0}
        currencyMode={currency}
        countText={`${formatNumberDisplay(stats?.invoiceCount ?? 0)} فاتورة`}
        subtext={`بعد خصم المرتجعات (${periodSubtext})`}
        icon={TrendingDown}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />

      {/* 2. Total Paid to Suppliers (Cash + Inline Paid + Payment/Disbursement Bonds) */}
      <StatCard
        title="المسدد للموردين (نقد + سندات)"
        value={formatCurrency(stats?.totalPaid ?? 0, 'SAR')}
        subtext="شامل النقدي وسندات الصرف"
        icon={Wallet}
        colorClass="text-emerald-600 dark:text-emerald-400"
        iconBgClass="bg-emerald-500"
      />

      {/* 3. Purchase Returns */}
      <StatCard
        title="مرتجعات المشتريات"
        value={formatCurrency(stats?.totalReturns ?? 0, 'SAR')}
        subtext={`${formatNumberDisplay(stats?.returnCount ?? 0)} فاتورة مرتجع`}
        icon={RefreshCw}
        colorClass="text-amber-600 dark:text-amber-400"
        iconBgClass="bg-amber-500"
      />

      {/* 4. Net Remaining Supplier Debt (Dual Currency Aware, after Bonds & Returns) */}
      <DualCurrencyStatCard
        title="صافي المتبقي للموردين"
        amountSAR={stats?.totalDebtSAR ?? 0}
        amountYER={stats?.totalDebtYER ?? 0}
        currencyMode={currency}
        countText={`${formatNumberDisplay(stats?.pendingPaymentCount ?? 0)} فاتورة آجلة`}
        subtext="بعد خصم السندات والمرتجعات"
        icon={CreditCard}
        colorClass="text-rose-600 dark:text-rose-400"
        iconBgClass="bg-rose-500"
      />
    </div>
  );
};

export default PurchaseStats;
