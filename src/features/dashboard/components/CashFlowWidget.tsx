import React from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatCurrency } from '../../../core/utils';

interface CashFlowData {
  inflow: number;
  outflow: number;
  net: number;
  inflowChange?: number;
  outflowChange?: number;
}

interface CashFlowWidgetProps {
  data?: CashFlowData;
  className?: string;
}

const CashFlowWidget: React.FC<CashFlowWidgetProps> = ({ data, className }) => {
  const hasData = data && (data.inflow > 0 || data.outflow > 0);

  const inflow = data?.inflow || 0;
  const outflow = data?.outflow || 0;
  const net = data?.net || 0;
  const inflowChange = data?.inflowChange;
  const outflowChange = data?.outflowChange;

  const maxAmount = Math.max(inflow, outflow);
  const inflowPercent = maxAmount > 0 ? (inflow / maxAmount) * 100 : 0;
  const outflowPercent = maxAmount > 0 ? (outflow / maxAmount) * 100 : 0;

  if (!hasData) {
    return (
      <div
        className={cn(
          'bg-[var(--app-surface)] border border-[var(--app-border)] p-4 rounded-xl',
          className
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-[var(--app-surface-hover)] rounded-lg text-[var(--accent)]">
            <Wallet size={16} />
          </div>
          <h3 className="text-xs font-bold text-[var(--app-text)]">التدفق النقدي</h3>
        </div>
        <div className="text-center py-6">
          <Wallet size={32} className="mx-auto text-[var(--app-text-secondary)] mb-2 opacity-50" />
          <p className="text-xs font-medium text-[var(--app-text-secondary)]">بانتظار حركة مالية</p>
          <p className="text-[10px] text-[var(--app-text-secondary)] mt-1">
            سجل سندات قبض أو صرف لتفعيل مؤشر التدفق
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-[var(--app-surface)] border border-[var(--app-border)] p-4 rounded-xl transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-[var(--app-surface-hover)] rounded-lg text-[var(--accent)]">
          <Wallet size={16} />
        </div>
        <h3 className="text-xs font-bold text-[var(--app-text)]">التدفق النقدي</h3>
      </div>

      {/* Flow Bars */}
      <div className="space-y-3">
        {/* Inflow */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <ArrowDownCircle size={14} className="text-emerald-500" />
              <span className="text-xs font-bold text-[var(--app-text)]">القبض</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                +{formatCurrency(inflow)}
              </span>
              {inflowChange !== undefined && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono',
                    inflowChange >= 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  )}
                >
                  {inflowChange >= 0 ? '+' : ''}
                  {inflowChange}%
                </span>
              )}
            </div>
          </div>
          <div className="h-2 bg-[var(--app-surface-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${inflowPercent}%` }}
            />
          </div>
        </div>

        {/* Outflow */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <ArrowUpCircle size={14} className="text-rose-500" />
              <span className="text-xs font-bold text-[var(--app-text)]">الصرف</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                -{formatCurrency(outflow)}
              </span>
              {outflowChange !== undefined && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono',
                    outflowChange <= 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  )}
                >
                  {outflowChange >= 0 ? '+' : ''}
                  {outflowChange}%
                </span>
              )}
            </div>
          </div>
          <div className="h-2 bg-[var(--app-surface-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full transition-all duration-300"
              style={{ width: `${outflowPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Net */}
      <div className="mt-3 flex items-center justify-between p-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg">
        <div className="flex items-center gap-1.5">
          {net >= 0 ? (
            <TrendingUp size={15} className="text-emerald-500" />
          ) : (
            <TrendingDown size={15} className="text-rose-500" />
          )}
          <span className="text-xs font-medium text-[var(--app-text-secondary)]">الصافي</span>
        </div>
        <span
          className={cn(
            'text-sm font-bold font-mono',
            net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          )}
        >
          {net >= 0 ? '+' : ''}
          {formatCurrency(net)}
        </span>
      </div>

      {/* Summary */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="text-center p-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">نسبة القبض</p>
          <p className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {inflow + outflow > 0 ? ((inflow / (inflow + outflow)) * 100).toFixed(0) : 0}%
          </p>
        </div>
        <div className="text-center p-1.5 bg-rose-500/5 border border-rose-500/15 rounded-lg">
          <p className="text-[10px] font-medium text-rose-600 dark:text-rose-400">نسبة الصرف</p>
          <p className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
            {inflow + outflow > 0 ? ((outflow / (inflow + outflow)) * 100).toFixed(0) : 0}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default CashFlowWidget;
