import React from 'react';
import { Coins, Briefcase, AlertTriangle } from 'lucide-react';
import Card from '../../../ui/base/Card';
import NumericInput from '../../../ui/base/NumericInput';
import { cn, formatCurrency } from '../../../core/utils';
import { suggestFloatPresets } from '../services/reconciliationService';

interface FloatSettlementCardProps {
  actualCash: number;
  floatRetained: number;
  onFloatRetainedChange: (value: number) => void;
  cashToOwner: number;
  netIsNegative: boolean;
  currency: string;
  disabled?: boolean | undefined;
}

/** لوحة إدخال الفكة مع مقترحات بمقياس عملة الأساس */
const FloatInputPanel: React.FC<{
  floatRetained: number;
  onFloatRetainedChange: (value: number) => void;
  currency: string;
  disabled: boolean;
}> = ({ floatRetained, onFloatRetainedChange, currency, disabled }) => {
  const presets = suggestFloatPresets(currency);
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5">
      <div className="flex items-center justify-between">
        <label htmlFor="reconciliation-float" className="text-xs font-bold text-[var(--app-text)]">
          المتبقي بالدرج لبكرة (فكة)
        </label>
        <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
          يُرحَّل تلقائياً
        </span>
      </div>

      <NumericInput
        value={floatRetained}
        min={0}
        step={1}
        disabled={disabled}
        onChange={onFloatRetainedChange}
        className="mt-1.5 w-full"
      />

      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {presets.map(amount => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                onFloatRetainedChange(amount);
              }}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-bold transition-colors',
                floatRetained === amount
                  ? 'bg-indigo-600 text-white'
                  : 'border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
              )}
            >
              {formatCurrency(amount, currency)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** لوحة الصافي المسلم للمالك مع تنبيه الصافي السالب */
const NetToOwnerPanel: React.FC<{
  actualCash: number;
  floatRetained: number;
  cashToOwner: number;
  netIsNegative: boolean;
  currency: string;
}> = ({ actualCash, floatRetained, cashToOwner, netIsNegative, currency }) => (
  <div
    className={cn(
      'flex flex-col justify-between rounded-lg border p-2.5',
      netIsNegative
        ? 'border-red-500/40 bg-red-500/5 dark:bg-red-950/20'
        : 'border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/20'
    )}
  >
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-bold',
          netIsNegative
            ? 'text-red-700 dark:text-red-400'
            : 'text-emerald-800 dark:text-emerald-300'
        )}
      >
        <Briefcase className="h-4 w-4" />
        <span>الصافي المسلم للمالك / الخزينة</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--app-text-secondary)]">
        الكاش الفعلي ({formatCurrency(actualCash, currency)}) − فكة الغد (
        {formatCurrency(floatRetained, currency)})
      </p>
    </div>

    <div className="mt-2">
      <span
        className={cn(
          'font-mono text-xl font-black',
          netIsNegative
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        {formatCurrency(cashToOwner, currency)}
      </span>
      {netIsNegative && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          الفكة المستبقاة أكبر من الكاش المعدود — صحّح الرقم قبل الاعتماد
        </p>
      )}
    </div>
  </div>
);

/**
 * بطاقة فكة الغد وصافي التوريد.
 * إصلاح جوهري: مقترحات الفكة كانت [200, 300, 500] ثابتة (مقياس ر.س) والصافي يُقصّ
 * عند الصفر فيخفي عجزاً. الآن المقترحات بمقياس عملة الأساس والصافي السالب يظهر ويُحجب.
 */
export const FloatSettlementCard: React.FC<FloatSettlementCardProps> = ({
  actualCash,
  floatRetained,
  onFloatRetainedChange,
  cashToOwner,
  netIsNegative,
  currency,
  disabled = false,
}) => (
  <Card className="p-3 sm:p-4">
    <div className="mb-3 flex items-center gap-2.5 border-b border-[var(--app-border)] pb-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
        <Coins className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--app-text)]">فكة الغد وصافي التوريد</h3>
        <p className="text-xs text-[var(--app-text-secondary)]">
          المتبقي بالدرج لافتتاح الغد، والباقي يُسلَّم للمالك/الخزينة
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FloatInputPanel
        floatRetained={floatRetained}
        onFloatRetainedChange={onFloatRetainedChange}
        currency={currency}
        disabled={disabled}
      />
      <NetToOwnerPanel
        actualCash={actualCash}
        floatRetained={floatRetained}
        cashToOwner={cashToOwner}
        netIsNegative={netIsNegative}
        currency={currency}
      />
    </div>
  </Card>
);
