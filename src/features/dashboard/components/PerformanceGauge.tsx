import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Target, Award, Star } from 'lucide-react';
import { cn } from '../../../core/utils';
import { useThemeStore } from '../../../lib/themeStore';
import { useContainerReady } from '../../../core/hooks/useContainerReady';

interface PerformanceGaugeProps {
  value: number;
  target: number;
  title?: string;
  /**
   * مُنسِّق مبالغ اختياري لعرض المحقق/الهدف بالعملة (مثل formatCurrency)
   * بدلاً من أرقام مجردة مضللة في سياق مالي.
   */
  formatValue?: (value: number) => string;
  className?: string;
}

const PerformanceGauge: React.FC<PerformanceGaugeProps> = ({
  value,
  target,
  title = 'أداء المبيعات',
  formatValue,
  className,
}) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { containerRef, isMounted } = useContainerReady();

  const displayValue = formatValue ? formatValue(value) : value.toLocaleString('en-US');
  const displayTarget = formatValue ? formatValue(target) : target.toLocaleString('en-US');
  const displayRemaining = formatValue
    ? formatValue(target - value)
    : (target - value).toLocaleString('en-US');

  const percentage = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const remaining = 100 - percentage;

  // Determine color based on performance
  const getColor = () => {
    if (percentage >= 80) return '#10b981'; // emerald
    if (percentage >= 60) return '#3b82f6'; // blue
    if (percentage >= 40) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const color = getColor();

  const data = [
    { value: percentage, color },
    { value: remaining, color: '#e2e8f0' },
  ];

  const getStatus = () => {
    if (percentage >= 80) return { label: 'ممتاز', icon: Award, color: 'text-emerald-500' };
    if (percentage >= 60) return { label: 'جيد جداً', icon: Star, color: 'text-blue-500' };
    if (percentage >= 40) return { label: 'جيد', icon: Target, color: 'text-amber-500' };
    return { label: 'يحتاج تحسين', icon: Target, color: 'text-rose-500' };
  };

  const status = getStatus();

  // If no data, show empty state
  if (value === 0 && target === 0) {
    return (
      <div
        className={cn(
          'bg-[var(--app-surface)]/80 flex h-64 items-center justify-center rounded-2xl border border-[var(--app-border)] p-5 backdrop-blur-xl max-md:rounded-xl max-md:p-3',
          className
        )}
      >
        <div className="text-center">
          <Target size={32} className="mx-auto mb-2 text-[var(--app-text-secondary)]" />
          <p className="text-sm font-bold text-[var(--app-text-secondary)]">لا توجد بيانات</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-[var(--app-surface)] rounded-xl border border-[var(--app-border)] p-4 transition-colors',
        className
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[var(--app-surface-hover)] p-2 text-[var(--accent)]">
            <Target size={16} />
          </div>
          <h3 className="text-xs font-bold text-[var(--app-text)]">{title}</h3>
        </div>
        <div className={cn('flex items-center gap-1', status.color)}>
          <status.icon size={13} />
          <span className="text-[10px] font-bold">{status.label}</span>
        </div>
      </div>

      {/* Gauge Chart */}
      <div ref={containerRef} className="relative h-40 min-h-[160px] overflow-hidden">
        {isMounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={120}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="75%"
                startAngle={180}
                endAngle={0}
                innerRadius={65}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                cornerRadius={4}
              >
                {data.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? color : isDark ? '#334155' : '#e2e8f0'}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-xl bg-[var(--app-surface-hover)]" />
        )}

        {/* Center Text */}
        <div className="absolute inset-0 flex items-center justify-center pt-10">
          <div className="text-center">
            <p className="font-mono text-3xl font-bold tracking-tight text-[var(--app-text)]">
              {percentage.toFixed(0)}%
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--app-text-secondary)]">
              من المستهدف
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 max-md:mt-3">
        <div className="rounded-xl border border-white/5 bg-white/5 p-2 text-center">
          <p className="text-[10px] font-bold uppercase text-[var(--app-text-secondary)]">المحقق</p>
          <p className="font-mono text-sm font-bold text-[var(--app-text)]">{displayValue}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-2 text-center">
          <p className="text-[10px] font-bold uppercase text-[var(--app-text-secondary)]">الهدف</p>
          <p className="font-mono text-sm font-bold text-[var(--app-text)]">{displayTarget}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
        <p className="mt-1 text-center text-[10px] font-medium text-[var(--app-text-secondary)]">
          متبقي {displayRemaining} للوصول للهدف
        </p>
      </div>
    </div>
  );
};

export default PerformanceGauge;
