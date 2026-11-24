import React from 'react';
import { Receipt, CreditCard, Clock, Layers } from 'lucide-react';
import StatCard from '../../../ui/common/StatCard';
import type { ExpenseStats as StatsType } from '../types';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';

interface Props {
  customStats?: StatsType;
}

const ExpenseStats: React.FC<Props> = ({ customStats }) => {
  if (!customStats) return null;

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard
        title="إجمالي المصروفات"
        value={formatCurrency(customStats.totalExpenses)}
        {...(customStats.totalExpensesYER && customStats.totalExpensesYER > 0
          ? { subtext: `منها باليمني: ${customStats.totalExpensesYER.toLocaleString('en-US')} ر.ي` }
          : {})}
        icon={Receipt}
        colorClass="text-rose-600 dark:text-rose-400"
        iconBgClass="bg-rose-500"
      />
      <StatCard
        title="مصروفات معتمدة"
        value={formatCurrency(customStats.paidExpenses)}
        subtext="مرحّلة / مسددة"
        icon={CreditCard}
        colorClass="text-emerald-600 dark:text-emerald-400"
        iconBgClass="bg-emerald-500"
      />
      <StatCard
        title="مسودات بانتظار الاعتماد"
        value={formatCurrency(customStats.pendingExpenses)}
        subtext="غير مرحّلة بعد"
        icon={Clock}
        colorClass="text-amber-600 dark:text-amber-400"
        iconBgClass="bg-amber-500"
      />
      <StatCard
        title="الفئات النشطة"
        value={formatNumberDisplay(customStats.categoriesCount)}
        subtext="تنوع المصروفات"
        icon={Layers}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />
    </div>
  );
};

export default ExpenseStats;
