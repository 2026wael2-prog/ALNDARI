import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import {
  Receipt,
  DollarSign,
  Tag,
  Activity,
  PieChart as PieIcon,
  Wallet,
  TrendingUp,
  Calendar,
  Filter,
} from 'lucide-react';
import { formatCurrency } from '../../../core/utils';
import type { Expense } from '../types';
import { useExpenseAnalytics } from '../hooks/useExpenseAnalytics';
import { useThemeStore } from '@/lib/themeStore';
import { cn } from '@/core/utils';

import type { ExpenseAnalyticsPeriod } from '../hooks/useExpenseAnalytics';

interface ExpensesAnalyticsViewProps {
  expenses: Expense[];
  period?: ExpenseAnalyticsPeriod;
}

const COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];

const ExpensesAnalyticsView: React.FC<ExpensesAnalyticsViewProps> = ({
  expenses,
  period = 'month',
}) => {
  const analytics = useExpenseAnalytics(expenses, period);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <div className="animate-in fade-in space-y-3 pb-16 duration-500 sm:space-y-6 sm:pb-20">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-1 sm:gap-4 lg:gap-6">
        {/* Total Expenses */}
        <div className="group relative min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-rose-600 to-rose-700 p-1.5 text-white shadow-sm transition-transform duration-500 hover:scale-[1.02] sm:rounded-2xl sm:p-5 sm:shadow-xl sm:shadow-rose-500/20 lg:p-6">
          <div className="absolute right-0 top-0 hidden transform p-4 opacity-20 transition-transform duration-500 group-hover:rotate-12 sm:block">
            <Receipt size={44} />
          </div>
          <p className="mb-0.5 truncate text-[10px] font-bold opacity-80 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">
            المصروفات
          </p>
          <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight sm:text-xl lg:text-2xl">
            {formatCurrency(analytics.totalAmount)}
          </h2>
          <div className="mt-2 hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold">
              {analytics.count} عملية دفع
            </span>
          </div>
        </div>

        {/* Average */}
        <div className="group relative min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 p-1.5 text-white shadow-sm transition-transform duration-500 hover:scale-[1.02] sm:rounded-2xl sm:p-5 sm:shadow-xl sm:shadow-orange-500/20 lg:p-6">
          <div className="absolute right-0 top-0 hidden transform p-4 opacity-20 transition-transform duration-500 group-hover:rotate-12 sm:block">
            <DollarSign size={44} />
          </div>
          <p className="mb-0.5 truncate text-[10px] font-bold opacity-80 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">
            المتوسط
          </p>
          <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight sm:text-xl lg:text-2xl">
            {formatCurrency(analytics.avgAmount)}
          </h2>
          <div className="mt-2 hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold">
              لكل فاتورة
            </span>
          </div>
        </div>

        {/* Categories */}
        <div className="group relative min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-[var(--app-surface)] p-1.5 shadow-sm transition-transform duration-500 hover:scale-[1.02] dark:border-slate-800 sm:rounded-2xl sm:p-5 sm:shadow-lg lg:p-6">
          <div className="absolute bottom-0 right-0 hidden transform p-4 opacity-5 transition-transform duration-500 group-hover:-translate-y-2 sm:block">
            <Tag size={56} className="text-purple-500" />
          </div>
          <p className="mb-0.5 truncate text-[10px] font-bold text-slate-400 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">
            التصنيفات
          </p>
          <h2 className="font-mono text-sm font-black tracking-tight text-slate-900 dark:text-white sm:text-xl lg:text-2xl">
            {analytics.categoryData.length}
          </h2>
          <div className="mt-2 hidden items-center gap-2 sm:flex">
            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-bold text-purple-500">
              تصنيف نشط
            </span>
          </div>
        </div>

        {/* Highest Category */}
        <div className="group relative min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-[var(--app-surface)] p-1.5 shadow-sm transition-transform duration-500 hover:scale-[1.02] dark:border-slate-800 sm:rounded-2xl sm:p-5 sm:shadow-lg lg:p-6">
          <div className="absolute bottom-0 right-0 hidden transform p-4 opacity-5 transition-transform duration-500 group-hover:-translate-y-2 sm:block">
            <TrendingUp size={56} className="text-emerald-500" />
          </div>
          <p className="mb-0.5 truncate text-[10px] font-bold text-slate-400 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">
            الأعلى إنفاقاً
          </p>
          <h2 className="truncate text-[10.5px] font-bold tracking-tight text-slate-900 dark:text-white sm:mb-1 sm:border-b sm:border-emerald-500/20 sm:pb-1 sm:text-base">
            {analytics.categoryData[0]?.name || '---'}
          </h2>
          <p className="truncate font-mono text-[10px] font-bold text-emerald-500 sm:text-xs" dir="ltr">
            {analytics.categoryData[0] ? formatCurrency(analytics.categoryData[0].amount) : ''}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Trend Chart */}
        <div className="group relative overflow-hidden rounded-[3rem] border border-slate-100 bg-[var(--app-surface)] p-8 shadow-2xl dark:border-slate-800">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h4 className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                <div className="rounded-xl bg-rose-500/10 p-2">
                  <Activity size={16} className="text-rose-500" />
                </div>
                اتجاه المصروفات
              </h4>
            </div>
            <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
              <Calendar size={14} className="text-slate-400" />
            </div>
          </div>

          <div className="relative h-[280px]">
            <ResponsiveContainer width="100%" height={280} minWidth={1} minHeight={1}>
              <AreaChart data={analytics.chartData}>
                <defs>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                  dy={10}
                  tickFormatter={value =>
                    new Date(value).toLocaleDateString('ar-SA-u-nu-latn', {
                      day: 'numeric',
                      month: 'short',
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip
                  cursor={{ stroke: '#f43f5e', strokeWidth: 2, strokeDasharray: '4 4' }}
                  content={({ active, payload }: any) => {
                    if (active && payload?.length) {
                      return (
                        <div
                          className={cn(
                            'rounded-3xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300',
                            isDark
                              ? 'border-slate-700/50 bg-slate-900/90 shadow-black/50'
                              : 'border-slate-200/50 bg-white/95 shadow-slate-200/50'
                          )}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {new Date(payload[0].payload.date).toLocaleDateString(
                                'ar-SA-u-nu-latn',
                                { day: 'numeric', month: 'long', year: 'numeric' }
                              )}
                            </p>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <p className="font-mono text-2xl font-bold tracking-tighter text-rose-500">
                              {formatCurrency(payload[0].value)}
                            </p>
                          </div>
                          <p className="mt-1 text-[10px] font-bold italic text-slate-500">
                            {payload[0].payload.count} عملية إنفاق مسجلة
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#f43f5e"
                  strokeWidth={4}
                  fill="url(#colorExpense)"
                  animationDuration={2500}
                  animationEasing="ease-in-out"
                  activeDot={{ r: 6, fill: '#f43f5e', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Chart */}
        <div className="group relative overflow-hidden rounded-[3rem] border border-slate-100 bg-[var(--app-surface)] p-8 shadow-2xl dark:border-slate-800">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h4 className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                <div className="rounded-xl bg-purple-500/10 p-2">
                  <PieIcon size={16} className="text-purple-500" />
                </div>
                تحليل التصنيفات
              </h4>
            </div>
            <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
              <Filter size={14} className="text-slate-400" />
            </div>
          </div>

          <div className="mb-8 h-[200px]">
            <ResponsiveContainer width="100%" height={200} minWidth={1} minHeight={1}>
              <PieChart>
                <Pie
                  data={analytics.categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="amount"
                  nameKey="name"
                  animationDuration={1500}
                >
                  {analytics.categoryData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      className="outline-none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (active && payload?.length) {
                      return (
                        <div
                          className={cn(
                            'rounded-3xl border p-4 shadow-2xl backdrop-blur-xl',
                            isDark
                              ? 'border-slate-700/50 bg-slate-900/80'
                              : 'border-slate-200/50 bg-white/90'
                          )}
                        >
                          <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                            {payload[0].name}
                          </p>
                          <p
                            className="font-mono text-lg font-bold"
                            style={{ color: payload[0].payload.fill }}
                          >
                            {formatCurrency(payload[0].value)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {analytics.categoryData.slice(0, 4).map((cat, index) => (
              <div
                key={cat.name}
                className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all duration-300 hover:border-purple-500/30 dark:border-slate-800 dark:bg-slate-800/50"
              >
                <div className="mb-1 flex items-center gap-3">
                  <div
                    className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(167,139,250,0.5)]"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    {cat.name}
                  </span>
                </div>
                <span
                  className="font-mono text-sm font-bold tracking-tighter text-slate-800 dark:text-slate-100"
                  dir="ltr"
                >
                  {formatCurrency(cat.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Methods Chart */}
      <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-[var(--app-surface)] p-3 shadow-lg dark:border-slate-800 md:rounded-[3rem] md:p-8 md:shadow-2xl">
        <div className="mb-3 flex items-center gap-2 md:mb-8 md:gap-3">
          <div className="rounded-xl bg-blue-500/10 p-1.5 md:p-2">
            <Wallet size={15} className="text-blue-500" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
            توزيع طرق الدفع
          </h4>
        </div>

        <div className="h-44 md:h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={160}>
            <BarChart
              data={analytics.paymentData}
              layout="vertical"
              margin={{ left: 30, right: 30 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'black' }}
                width={80}
              />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (active && payload?.length) {
                    return (
                      <div
                        className={cn(
                          'rounded-3xl border p-4 shadow-2xl backdrop-blur-xl',
                          isDark
                            ? 'border-slate-700/50 bg-slate-900/80'
                            : 'border-slate-200/50 bg-white/90'
                        )}
                      >
                        <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                          {payload[0].payload.name}
                        </p>
                        <p className="font-mono text-lg font-bold text-blue-500">
                          {formatCurrency(payload[0].value)}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="amount" radius={[0, 20, 20, 0]} barSize={32} minPointSize={1}>
                {analytics.paymentData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    className="transition-all duration-500"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ExpensesAnalyticsView;
