import React from 'react';
import { DollarSign, Wallet, CreditCard, RefreshCw } from 'lucide-react';
import StatCard from '../../../../ui/common/StatCard';
import { useSalesStats } from '../../hooks/index';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import ErrorDisplay from '../../../../ui/base/ErrorDisplay';
import Spinner from '../../../../ui/base/Spinner';

const SalesStats: React.FC = () => {
  const { data: stats, isLoading, error, refetch } = useSalesStats();

  if (isLoading) {
    return (
      <div className="flex justify-center p-8 max-md:p-4">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error?.message || null} variant="mini" onRetry={refetch} />;
  }

  if (!stats) return null;

  const growth = stats.monthlyGrowth;
  const salesSubtext =
    growth !== null && growth !== undefined
      ? `${formatNumberDisplay(stats.invoiceCount)} فاتورة • نمو ${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`
      : `${formatNumberDisplay(stats.invoiceCount)} فاتورة (بعد المرتجعات)`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-md:gap-2">
      <StatCard
        title="صافي المبيعات"
        value={formatCurrency(stats.netSales ?? stats.totalSales)}
        subtext={salesSubtext}
        icon={DollarSign}
        colorClass="text-emerald-600 dark:text-emerald-400"
        iconBgClass="bg-emerald-500"
      />
      <StatCard
        title="المحصّل الفعلي (نقد + سندات)"
        value={formatCurrency(stats.totalCollected ?? 0)}
        subtext="مبيعات نقدية + سندات قبض"
        icon={Wallet}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />
      <StatCard
        title="متبقي ذمم الآجل"
        value={formatCurrency(stats.totalRemainingCredit ?? 0)}
        subtext="آجل فقط بعد خصم السندات والمرتجعات"
        icon={CreditCard}
        colorClass="text-rose-600 dark:text-rose-400"
        iconBgClass="bg-rose-500"
      />
      <StatCard
        title="مرتجعات المبيعات"
        value={formatCurrency(stats.totalReturns ?? 0)}
        subtext={`${formatNumberDisplay(stats.returnCount ?? 0)} فاتورة مرتجع`}
        icon={RefreshCw}
        colorClass="text-amber-600 dark:text-amber-400"
        iconBgClass="bg-amber-500"
      />
    </div>
  );
};

export default SalesStats;
