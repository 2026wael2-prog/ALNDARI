import React from 'react';
import { useContainerReady } from '@/core/hooks/useContainerReady';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useThemeStore } from '../../../../lib/themeStore';
import { reportService } from '../../services/reportService';
import { useAuthStore } from '../../../auth/store';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import { useBranchFilter } from '../../../branches/hooks/useBranchFilter';
import { logger } from '../../../../core/utils/logger';

interface FinancialPerformanceChartProps {
  year?: number;
}

const FinancialPerformanceChart: React.FC<FinancialPerformanceChartProps> = ({ year }) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const { branchId } = useBranchFilter();
  const isDark = theme === 'dark';

  const { containerRef, isMounted } = useContainerReady();

  const selectedYear = year || new Date().getFullYear();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['monthly_performance', user?.company_id, branchId, selectedYear],
    queryFn: () =>
      user?.company_id
        ? reportService.getMonthlyPerformance(user.company_id, selectedYear, branchId)
        : Promise.resolve([]),
    enabled: !!user?.company_id,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-[var(--app-text-secondary)]">
        <Loader2 className="animate-spin text-blue-500" size={32} />
        <p className="animate-pulse text-[10px] font-bold uppercase tracking-widest">
          جاري تحليل البيانات...
        </p>
      </div>
    );
  }

  if (isError) {
    logger.error('FinancialPerformanceChart', 'Error fetching chart data');
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-[var(--app-text-secondary)]">
        <AlertTriangle size={28} className="text-amber-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest">
          تعذر تحميل بيانات الأداء المالي
        </p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-600 transition-colors hover:text-blue-700 dark:bg-blue-900/30"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const formatYAxisTick = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(Math.round(v));
  };

  return (
    <div ref={containerRef} className="relative h-52 w-full p-1 md:h-72 md:p-2">
      {isMounted && (
        <ResponsiveContainer width="100%" height="100%" minWidth={1} debounce={1} minHeight={180}>
          <BarChart data={data ?? []} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                <stop offset="100%" stopColor="#e11d48" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={isDark ? '#1e293b' : '#f1f5f9'}
            />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'black' }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={formatYAxisTick}
            />
            <Tooltip
              cursor={{ fill: isDark ? '#ffffff05' : '#00000005' }}
              content={({ active, payload }: any) => {
                if (active && payload?.length) {
                  return (
                    <div
                      className={cn(
                        'rounded-xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 max-md:rounded-lg max-md:p-2',
                        isDark
                          ? 'border-slate-700/50 bg-slate-900/80 shadow-black/50'
                          : 'border-slate-200/50 bg-white/90 shadow-slate-200/50'
                      )}
                    >
                      <p className="mb-3 border-b border-slate-200/10 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                        {payload[0].payload.name}
                      </p>
                      <div className="space-y-3">
                        {payload.map((entry: any, index: number) => (
                          <div
                            key={index}
                            className="flex items-center justify-between gap-8 max-md:gap-3"
                          >
                            <div className="flex items-center gap-2 max-md:gap-1">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-[11px] font-bold uppercase text-slate-500">
                                {entry.name}
                              </span>
                            </div>
                            <span
                              className="font-mono text-sm font-bold tracking-tighter"
                              style={{ color: entry.color }}
                            >
                              {formatCurrency(entry.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{
                fontSize: '10px',
                fontWeight: 'black',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                paddingTop: '20px',
              }}
            />
            <Bar
              dataKey="revenues"
              name="الإيرادات"
              fill="url(#gradRevenue)"
              radius={[10, 10, 0, 0]}
              barSize={12}
              animationDuration={2000}
              minPointSize={1}
            />
            <Bar
              dataKey="expenses"
              name="المصروفات"
              fill="url(#gradExpense)"
              radius={[10, 10, 0, 0]}
              barSize={12}
              animationDuration={2000}
              minPointSize={1}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default FinancialPerformanceChart;
