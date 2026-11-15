import React from 'react';
import AccountingStats from './AccountingStats';
import QuickActions from '../overview/QuickActions';
import KeyAccountBalances from '../overview/KeyAccountBalances';
import RecentJournals from '../overview/RecentJournals';
import FinancialPerformanceChart from '../overview/FinancialPerformanceChart';
import { BarChart3, Activity, Calendar } from 'lucide-react';
import Card from '../../../../ui/base/Card';
import { cn, formatLocalDate, getLocalYearStart } from '../../../../core/utils';

interface AccountingOverviewProps {
  onNewJournal?: () => void;
  dateRange?: { from: string; to: string };
  onDateRangeChange?: (range: { from: string; to: string }) => void;
}

const AccountingOverview: React.FC<AccountingOverviewProps> = ({
  onNewJournal,
  dateRange,
  onDateRangeChange,
}) => {
  const currentYear = new Date().getFullYear();
  const today = formatLocalDate();
  const yearStart = getLocalYearStart();
  const effectiveDateRange = dateRange ?? { from: yearStart, to: today };

  const fromYear = Number(effectiveDateRange.from.slice(0, 4));
  const toYear = Number(effectiveDateRange.to.slice(0, 4));
  const selectedYear =
    Number.isFinite(toYear) && toYear >= 2000 ? (fromYear === toYear ? fromYear : toYear) : currentYear;

  const yearPresets = [
    { key: 'current', label: `السنة الجارية (${currentYear})`, from: yearStart, to: today },
    {
      key: `y-${currentYear - 1}`,
      label: `${currentYear - 1}`,
      from: `${currentYear - 1}-01-01`,
      to: `${currentYear - 1}-12-31`,
    },
    {
      key: `y-${currentYear - 2}`,
      label: `${currentYear - 2}`,
      from: `${currentYear - 2}-01-01`,
      to: `${currentYear - 2}-12-31`,
    },
    { key: 'all', label: 'كل السنوات', from: '2000-01-01', to: today },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Top Stats Bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-secondary)]">
            <Activity size={14} className="text-blue-500" /> الحالة المالية اللحظية
            <span className="inline-flex items-center gap-1 rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
              <Calendar size={10} />
              {effectiveDateRange.from} → {effectiveDateRange.to}
            </span>
          </h3>

          {onDateRangeChange && (
            <div className="flex flex-wrap items-center gap-1">
              {yearPresets.map(preset => {
                const isSelected =
                  effectiveDateRange.from === preset.from && effectiveDateRange.to === preset.to;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => onDateRangeChange({ from: preset.from, to: preset.to })}
                    className={cn(
                      'rounded border px-2 py-0.5 font-mono text-[10px] font-bold transition-colors',
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:border-blue-400 hover:text-blue-600'
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <AccountingStats dateRange={effectiveDateRange} />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-md:gap-3 items-start">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-4">
            <Card variant="ledger" className="p-4">
              <h3 className="text-xs font-bold text-[var(--app-text)] mb-4 px-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-500" />
                  أداء الإيرادات مقابل المصروفات
                </span>
                <span className="font-mono text-[10px] font-bold text-[var(--app-text-secondary)]">
                  ({selectedYear})
                </span>
              </h3>
              <FinancialPerformanceChart year={selectedYear} />
            </Card>
            <RecentJournals />
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-1 space-y-4">
            <QuickActions {...(onNewJournal ? { onNewJournal } : {})} />
            <KeyAccountBalances />
        </div>
      </div>
    </div>
  );
};

export default AccountingOverview;
