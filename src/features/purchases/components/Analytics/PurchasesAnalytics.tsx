import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { usePurchasesAnalytics } from '../../hooks';
import { Loader2, TrendingDown, Users } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import { AnalyticsUnifiedFilterBar } from '../../../../ui/common/AnalyticsUnifiedFilterBar';
import { PurchaseStats } from '../PurchaseStats';

const CustomTooltip = ({ active, payload, label }: TooltipContentProps): React.ReactNode => {
  if (!active || payload.length === 0) return null;
  return (
    <div className="p-3 rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl transition-all duration-200">
      <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tight border-b border-slate-100 dark:border-slate-800 pb-1">
        {label}
      </p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{entry.name}</span>
          </div>
          <span className="text-xs font-bold font-mono">
            {formatCurrency(Number(entry.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
};

const TrendTooltip = ({ active, payload, label }: TooltipContentProps): React.ReactNode => {
  if (!active || payload.length === 0) return null;
  return (
    <div className="p-3 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl transition-all duration-300">
      <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider leading-none border-b border-slate-100 dark:border-slate-800 pb-1.5">
        {new Date(String(label)).toLocaleDateString('ar-SA-u-nu-latn', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      <div className="flex flex-col gap-0.5 py-1">
        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">
          قيمة التوريدات
        </span>
        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tighter">
          {formatCurrency(Number(payload[0].value ?? 0))}
        </p>
      </div>
    </div>
  );
};

interface SupplierChartProps {
  data: Array<{ name: string; value: number }>;
}

const SupplierChart: React.FC<SupplierChartProps> = ({ data }) => (
  <div className="bg-[var(--app-surface)] p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 relative group overflow-hidden">
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <Users size={16} className="text-blue-500" />
      </div>
      <h3 className="text-xs font-bold text-slate-800 dark:text-white">
        أفضل الموردين (حسب القيمة)
      </h3>
    </div>
    <div className="h-64 w-full" dir="ltr">
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-xs text-slate-400">
          لا توجد بيانات توريد خلال الفترة المحددة
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250} minWidth={1} minHeight={1}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <defs>
              <linearGradient id="supplierGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={90}
              tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={CustomTooltip} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
            <Bar
              dataKey="value"
              name="إجمالي المشتريات"
              fill="url(#supplierGradient)"
              radius={[0, 8, 8, 0]}
              barSize={20}
              minPointSize={1}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

interface TrendChartProps {
  data: Array<{ date: string; amount: number }>;
}

const TrendChart: React.FC<TrendChartProps> = ({ data }) => (
  <div className="bg-[var(--app-surface)] p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 relative group overflow-hidden">
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
        <TrendingDown size={16} className="text-emerald-500 rotate-180" />
      </div>
      <h3 className="text-xs font-bold text-slate-800 dark:text-white">
        حجم التوريد اليومي
      </h3>
    </div>
    <div className="h-64 w-full" dir="ltr">
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-xs text-slate-400">
          لا توجد بيانات توريد خلال الفترة المحددة
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250} minWidth={1} minHeight={1}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(148, 163, 184, 0.1)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
              axisLine={false}
              tickLine={false}
              dy={5}
              tickFormatter={(value: string | number): string =>
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
              tickFormatter={(value: number): string =>
                value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)
              }
            />
            <Tooltip content={TrendTooltip} cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }} />
            <Bar
              dataKey="amount"
              name="القيمة"
              fill="url(#trendGradient)"
              radius={[6, 6, 0, 0]}
              barSize={24}
              animationDuration={1500}
              minPointSize={1}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

export const PurchasesAnalytics: React.FC = () => {
  const { data: analytics, isLoading, refetch, isFetching } = usePurchasesAnalytics();

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 1. Unified Multi-Dimensional Filter Bar */}
      <AnalyticsUnifiedFilterBar
        onRefresh={() => {
          void refetch();
        }}
        isRefreshing={isFetching}
      />

      {/* 2. Dynamic KPI Cards (Dual Currency & Period Aware) */}
      <PurchaseStats />

      {/* 3. Deep Analytics Charts */}
      {isLoading || !analytics ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 bg-[var(--app-surface)] rounded-2xl border border-[var(--app-border)]">
          <Loader2 className="animate-spin text-blue-500" size={32} />
          <p className="text-xs text-slate-500 font-bold">جاري تحليل بيانات المشتريات...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SupplierChart data={analytics.topSuppliers} />
          <TrendChart data={analytics.chartData} />
        </div>
      )}
    </div>
  );
};

export default PurchasesAnalytics;
